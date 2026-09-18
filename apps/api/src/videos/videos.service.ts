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
  UploadRefusal,
  UploadRefusalReason,
  VIDEO_PART_SIZE_BYTES,
  VideoLimits,
  VideoListResponse,
  VideoRejectionReason,
  VideoResponse,
  VideoUrlResponse,
} from '@playwithpro/shared';
import { SessionStatus, VideoStatus } from '@prisma/client';
import type { Video } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { COACH_ACCESS_STATUSES } from '../bookings/session-access';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { RenameVideoDto } from './dto/rename-video.dto';
import { SignVideoPartsDto } from './dto/sign-video-parts.dto';
import { VideoProcessingService } from './video-processing.service';
import { toVideoResponse, VideoResponseExtras } from './video.mapper';
import { PRESENT_USER } from '../account-data/departing';

const URL_TTL_SECONDS = 3600;
const GB = 1024 * 1024 * 1024;

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

  private retentionDays(): number {
    return this.config.getOrThrow<number>('VIDEO_UNATTACHED_RETENTION_DAYS');
  }

  /**
   * The three limit levels the client shows up front: per file, per
   * video-analysis session, per account library (with current usage).
   * Rejected videos hold no object and do not count; in-flight uploads count
   * with their declared size.
   */
  async limits(userId: string): Promise<VideoLimits> {
    const usage = await this.prisma.video.aggregate({
      where: { ownerId: userId, status: { not: VideoStatus.REJECTED } },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    });
    return {
      file: {
        maxSizeBytes: this.maxSizeBytes(),
        maxDurationSeconds:
          this.config.getOrThrow<number>('VIDEO_MAX_DURATION_MIN') * 60,
      },
      session: {
        maxClips: this.config.getOrThrow<number>('SESSION_VIDEO_MAX_COUNT'),
        maxTotalSeconds:
          this.config.getOrThrow<number>('SESSION_VIDEO_MAX_TOTAL_MIN') * 60,
      },
      library: {
        maxBytes: this.config.getOrThrow<number>('LIBRARY_MAX_TOTAL_GB') * GB,
        maxVideos: this.config.getOrThrow<number>('LIBRARY_MAX_VIDEOS'),
        usedBytes: Number(usage._sum.sizeBytes ?? 0),
        count: usage._count._all,
      },
    };
  }

  async createUpload(
    userId: string,
    dto: CreateVideoUploadDto,
  ): Promise<CreateVideoUploadResponse> {
    if (dto.sizeBytes > this.maxSizeBytes()) {
      throw new BadRequestException(
        `File exceeds the ${this.config.getOrThrow<number>(
          'VIDEO_MAX_SIZE_MB',
        )} MB limit.`,
      );
    }
    const { library } = await this.limits(userId);
    const remainingBytes = Math.max(0, library.maxBytes - library.usedBytes);
    if (library.count >= library.maxVideos) {
      refuse(UploadRefusalReason.LibraryFullCount, remainingBytes, library);
    }
    if (dto.sizeBytes > remainingBytes) {
      refuse(UploadRefusalReason.LibraryFullBytes, remainingBytes, library);
    }
    const videoId = randomUUID();
    const key = `videos/${userId}/${videoId}/original.${fileExtension(
      dto.fileName,
    )}`;
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
        // Declared size counts against the quota while the upload is in
        // flight; completion overwrites it with the stored object's size.
        sizeBytes: BigInt(dto.sizeBytes),
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
    const [videos, limits, attached] = await Promise.all([
      this.prisma.video.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.limits(userId),
      this.attachedUpcomingCounts(userId),
    ]);
    const retentionDays = this.retentionDays();
    return {
      videos: videos.map((video) =>
        toVideoResponse(video, {
          retentionDays,
          attachedUpcomingSessions: attached.get(video.id) ?? 0,
        }),
      ),
      limits,
    };
  }

  async get(userId: string, videoId: string): Promise<VideoResponse> {
    const video = await this.requireViewable(userId, videoId);
    const extras: VideoResponseExtras = {
      retentionDays: this.retentionDays(),
      attachedUpcomingSessions:
        video.ownerId === userId
          ? ((await this.attachedUpcomingCounts(userId, video.id)).get(
              video.id,
            ) ?? 0)
          : 0,
    };
    return toVideoResponse(video, extras);
  }

  /** Per video: live (not cancelled) sessions that have not started yet. */
  private async attachedUpcomingCounts(
    ownerId: string,
    videoId?: string,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.sessionVideo.groupBy({
      by: ['videoId'],
      where: {
        video: { ownerId, ...(videoId ? { id: videoId } : {}) },
        session: {
          status: { not: SessionStatus.CANCELLED },
          startsAt: { gt: new Date() },
        },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.videoId, row._count._all]));
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
    await this.purge(await this.requireOwned(userId, videoId));
  }

  /**
   * Removes the stored objects and the row (attachment rows cascade). Shared
   * by the owner's delete and the retention sweep.
   */
  async purge(video: Video): Promise<void> {
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
    const video = await this.requireViewable(userId, videoId);
    if (video.status !== 'READY') {
      throw new ConflictException('This video is not ready yet.');
    }
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

  /**
   * Viewing (metadata + playback) is owner-or-session-coach; everything else
   * stays owner-only. Coach access starts at payment and survives the session
   * lifecycle, but never covers cancelled or unpaid bookings.
   */
  private async requireViewable(
    userId: string,
    videoId: string,
  ): Promise<Video> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video) {
      throw new NotFoundException();
    }
    if (video.ownerId === userId) {
      return video;
    }
    const qualifying = await this.prisma.session.findFirst({
      where: {
        videos: { some: { videoId } },
        proProfile: { userId },
        status: { in: COACH_ACCESS_STATUSES },
        // A departing player's clips close at the deletion request.
        player: PRESENT_USER,
      },
      select: { id: true },
    });
    if (!qualifying) {
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

function refuse(
  reason: UploadRefusalReason,
  remainingBytes: number,
  library: VideoLimits['library'],
): never {
  const body: UploadRefusal & { statusCode: number; message: string } = {
    statusCode: 409,
    message:
      reason === UploadRefusalReason.LibraryFullCount
        ? `Your library already holds ${library.maxVideos} videos.`
        : 'Not enough space left in your library for this file.',
    reason,
    remainingBytes,
    maxVideos: library.maxVideos,
  };
  throw new ConflictException(body);
}

function fileExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(fileName);
  return match ? match[1].toLowerCase() : 'mp4';
}

function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  return base.length > 0 ? base.slice(0, 200) : 'Untitled';
}
