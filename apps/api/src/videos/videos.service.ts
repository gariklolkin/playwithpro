import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateVideoUploadResponse,
  SignVideoPartsResponse,
  VIDEO_PART_SIZE_BYTES,
  VideoListResponse,
  VideoRejectionReason,
  VideoResponse,
  VideoUrlResponse,
} from '@playwithpro/shared';
import type { Video } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { RenameVideoDto } from './dto/rename-video.dto';
import { SignVideoPartsDto } from './dto/sign-video-parts.dto';
import { VideoProcessingService } from './video-processing.service';
import { toVideoResponse } from './video.mapper';

const URL_TTL_SECONDS = 3600;

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly processing: VideoProcessingService,
  ) {}

  private maxSizeBytes(): number {
    return this.config.getOrThrow<number>('VIDEO_MAX_SIZE_MB') * 1024 * 1024;
  }

  async createUpload(
    userId: string,
    dto: CreateVideoUploadDto,
  ): Promise<CreateVideoUploadResponse> {
    if (dto.sizeBytes > this.maxSizeBytes()) {
      throw new BadRequestException(
        `File exceeds the ${this.config.getOrThrow<number>('VIDEO_MAX_SIZE_MB')} MB limit.`,
      );
    }
    const videoId = randomUUID();
    const key = `videos/${userId}/${videoId}/original.${fileExtension(dto.fileName)}`;
    const uploadId = await this.storage.createMultipartUpload(
      key,
      dto.contentType,
    );
    await this.prisma.video.create({
      data: {
        id: videoId,
        ownerId: userId,
        title: titleFromFileName(dto.fileName),
        originalKey: key,
        s3UploadId: uploadId,
      },
    });
    return { videoId, uploadId, key, partSizeBytes: VIDEO_PART_SIZE_BYTES };
  }

  async signParts(
    userId: string,
    videoId: string,
    dto: SignVideoPartsDto,
  ): Promise<SignVideoPartsResponse> {
    const video = await this.requireInFlightUpload(userId, videoId);
    const urls = await Promise.all(
      dto.partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart(
          video.originalKey,
          video.s3UploadId as string,
          partNumber,
        ),
      })),
    );
    return { urls };
  }

  async completeUpload(
    userId: string,
    videoId: string,
    dto: CompleteVideoUploadDto,
  ): Promise<VideoResponse> {
    const video = await this.requireInFlightUpload(userId, videoId);
    await this.storage.completeMultipartUpload(
      video.originalKey,
      video.s3UploadId as string,
      dto.parts.map((part) => ({
        partNumber: part.partNumber,
        etag: part.etag,
      })),
    );
    const head = await this.storage.headObject(video.originalKey);
    if (!head) {
      throw new BadRequestException('Uploaded file not found in storage.');
    }
    // The declared size was checked at initiation; the stored object is the
    // authority. Oversized uploads are rejected, not silently kept.
    if (head.contentLength > this.maxSizeBytes()) {
      await this.storage.deleteObject(video.originalKey);
      const rejected = await this.prisma.video.update({
        where: { id: video.id },
        data: {
          status: 'REJECTED',
          s3UploadId: null,
          sizeBytes: BigInt(head.contentLength),
          rejectionReason: VideoRejectionReason.TooLarge,
        },
      });
      return toVideoResponse(rejected);
    }
    const updated = await this.prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'PROCESSING',
        s3UploadId: null,
        sizeBytes: BigInt(head.contentLength),
      },
    });
    this.processing.enqueue(video.id);
    return toVideoResponse(updated);
  }

  async list(userId: string): Promise<VideoListResponse> {
    const videos = await this.prisma.video.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return { videos: videos.map(toVideoResponse) };
  }

  async get(userId: string, videoId: string): Promise<VideoResponse> {
    return toVideoResponse(await this.requireOwned(userId, videoId));
  }

  async rename(
    userId: string,
    videoId: string,
    dto: RenameVideoDto,
  ): Promise<VideoResponse> {
    const video = await this.requireOwned(userId, videoId);
    const updated = await this.prisma.video.update({
      where: { id: video.id },
      data: { title: dto.title },
    });
    return toVideoResponse(updated);
  }

  async delete(userId: string, videoId: string): Promise<void> {
    const video = await this.requireOwned(userId, videoId);
    if (video.s3UploadId) {
      await this.storage.abortMultipartUpload(
        video.originalKey,
        video.s3UploadId,
      );
    } else {
      await this.storage.deleteObject(video.originalKey);
      if (video.playbackKey && video.playbackKey !== video.originalKey) {
        await this.storage.deleteObject(video.playbackKey);
      }
    }
    await this.prisma.video.delete({ where: { id: video.id } });
  }

  async playbackUrl(
    userId: string,
    videoId: string,
  ): Promise<VideoUrlResponse> {
    const video = await this.requireReady(userId, videoId);
    return {
      url: await this.storage.presignGet(
        video.playbackKey ?? video.originalKey,
        URL_TTL_SECONDS,
      ),
      expiresInSeconds: URL_TTL_SECONDS,
    };
  }

  async downloadUrl(
    userId: string,
    videoId: string,
  ): Promise<VideoUrlResponse> {
    const video = await this.requireReady(userId, videoId);
    const extension = fileExtension(video.originalKey);
    return {
      url: await this.storage.presignGet(
        video.originalKey,
        URL_TTL_SECONDS,
        `${video.title}.${extension}`,
      ),
      expiresInSeconds: URL_TTL_SECONDS,
    };
  }

  /** Ownership is checked with a 404, never a 403 — no existence oracle. */
  private async requireOwned(userId: string, videoId: string): Promise<Video> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video || video.ownerId !== userId) {
      throw new NotFoundException();
    }
    return video;
  }

  private async requireInFlightUpload(
    userId: string,
    videoId: string,
  ): Promise<Video> {
    const video = await this.requireOwned(userId, videoId);
    if (video.status !== 'UPLOADING' || !video.s3UploadId) {
      throw new ConflictException('This upload is no longer in flight.');
    }
    return video;
  }

  private async requireReady(userId: string, videoId: string): Promise<Video> {
    const video = await this.requireOwned(userId, videoId);
    if (video.status !== 'READY') {
      throw new ConflictException('This video is not ready yet.');
    }
    return video;
  }
}

function fileExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(fileName);
  return match ? match[1].toLowerCase() : 'mp4';
}

function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  return base.length > 0 ? base.slice(0, 200) : 'Untitled';
}
