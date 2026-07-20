import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { VideoRejectionReason, VideoStatus } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { VideoProcessingService } from './video-processing.service';
import { VideosService } from './videos.service';

describe('VideosService', () => {
  let service: VideosService;

  const prisma = {
    video: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const storage = {
    createMultipartUpload: jest.fn(),
    presignUploadPart: jest.fn(),
    completeMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
    presignGet: jest.fn(),
  };
  const processing = { enqueue: jest.fn() };
  // 1 MB size limit keeps test numbers small.
  const config = {
    getOrThrow: (name: string) =>
      ({ VIDEO_MAX_SIZE_MB: 1, VIDEO_MAX_DURATION_MIN: 30 })[name],
  };

  const uploadingVideo = {
    id: 'video-1',
    ownerId: 'user-1',
    title: 'match',
    status: 'UPLOADING',
    originalKey: 'videos/user-1/video-1/original.mp4',
    playbackKey: null,
    s3UploadId: 'upload-1',
    sizeBytes: null,
    durationSeconds: null,
    width: null,
    height: null,
    fps: null,
    codec: null,
    container: null,
    rejectionReason: null,
    createdAt: new Date('2026-07-20T10:00:00Z'),
    updatedAt: new Date('2026-07-20T10:00:00Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: ConfigService, useValue: config },
        { provide: VideoProcessingService, useValue: processing },
      ],
    }).compile();
    service = moduleRef.get(VideosService);
  });

  describe('createUpload', () => {
    it('rejects a file over the size limit without touching storage', async () => {
      await expect(
        service.createUpload('user-1', {
          fileName: 'big.mp4',
          contentType: 'video/mp4',
          sizeBytes: 2 * 1024 * 1024,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.createMultipartUpload).not.toHaveBeenCalled();
    });

    it('creates an UPLOADING record keyed under the owner', async () => {
      storage.createMultipartUpload.mockResolvedValue('upload-1');
      prisma.video.create.mockResolvedValue(uploadingVideo);

      const result = await service.createUpload('user-1', {
        fileName: 'My Match.MOV',
        contentType: 'video/quicktime',
        sizeBytes: 1024,
      });

      expect(result.uploadId).toBe('upload-1');
      expect(result.key).toBe(`videos/user-1/${result.videoId}/original.mov`);
      const data = prisma.video.create.mock.calls[0][0].data;
      expect(data.ownerId).toBe('user-1');
      expect(data.title).toBe('My Match');
    });
  });

  describe('signParts', () => {
    it('404s for a video owned by someone else', async () => {
      prisma.video.findUnique.mockResolvedValue({
        ...uploadingVideo,
        ownerId: 'other',
      });

      await expect(
        service.signParts('user-1', 'video-1', { partNumbers: [1] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s when the upload already completed', async () => {
      prisma.video.findUnique.mockResolvedValue({
        ...uploadingVideo,
        status: 'READY',
        s3UploadId: null,
      });

      await expect(
        service.signParts('user-1', 'video-1', { partNumbers: [1] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('signs a URL per requested part', async () => {
      prisma.video.findUnique.mockResolvedValue(uploadingVideo);
      storage.presignUploadPart.mockImplementation(
        (_key: string, _uploadId: string, part: number) =>
          Promise.resolve(`https://signed/part-${part}`),
      );

      const result = await service.signParts('user-1', 'video-1', {
        partNumbers: [1, 3],
      });

      expect(result.urls).toEqual([
        { partNumber: 1, url: 'https://signed/part-1' },
        { partNumber: 3, url: 'https://signed/part-3' },
      ]);
    });
  });

  describe('completeUpload', () => {
    it('finalizes, re-checks size, and hands off to processing', async () => {
      prisma.video.findUnique.mockResolvedValue(uploadingVideo);
      storage.headObject.mockResolvedValue({
        contentLength: 512 * 1024,
        contentType: 'video/mp4',
      });
      prisma.video.update.mockResolvedValue({
        ...uploadingVideo,
        status: 'PROCESSING',
        sizeBytes: BigInt(512 * 1024),
      });

      const result = await service.completeUpload('user-1', 'video-1', {
        parts: [{ partNumber: 1, etag: 'a' }],
      });

      expect(storage.completeMultipartUpload).toHaveBeenCalledWith(
        uploadingVideo.originalKey,
        'upload-1',
        [{ partNumber: 1, etag: 'a' }],
      );
      expect(prisma.video.update.mock.calls[0][0].data.status).toBe(
        'PROCESSING',
      );
      expect(processing.enqueue).toHaveBeenCalledWith('video-1');
      expect(result.status).toBe(VideoStatus.Processing);
    });

    it('rejects an object that grew past the limit', async () => {
      prisma.video.findUnique.mockResolvedValue(uploadingVideo);
      storage.headObject.mockResolvedValue({
        contentLength: 5 * 1024 * 1024,
        contentType: 'video/mp4',
      });
      prisma.video.update.mockResolvedValue({
        ...uploadingVideo,
        status: 'REJECTED',
        rejectionReason: VideoRejectionReason.TooLarge,
      });

      const result = await service.completeUpload('user-1', 'video-1', {
        parts: [{ partNumber: 1, etag: 'a' }],
      });

      expect(storage.deleteObject).toHaveBeenCalledWith(
        uploadingVideo.originalKey,
      );
      expect(processing.enqueue).not.toHaveBeenCalled();
      expect(result.status).toBe(VideoStatus.Rejected);
      expect(result.rejectionReason).toBe(VideoRejectionReason.TooLarge);
    });
  });

  describe('delete', () => {
    it('aborts the multipart upload for an in-flight video', async () => {
      prisma.video.findUnique.mockResolvedValue(uploadingVideo);

      await service.delete('user-1', 'video-1');

      expect(storage.abortMultipartUpload).toHaveBeenCalledWith(
        uploadingVideo.originalKey,
        'upload-1',
      );
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(prisma.video.delete).toHaveBeenCalledWith({
        where: { id: 'video-1' },
      });
    });

    it('removes original and rendition for a ready video', async () => {
      prisma.video.findUnique.mockResolvedValue({
        ...uploadingVideo,
        status: 'READY',
        s3UploadId: null,
        playbackKey: 'videos/user-1/video-1/playback.mp4',
      });

      await service.delete('user-1', 'video-1');

      expect(storage.deleteObject).toHaveBeenCalledWith(
        uploadingVideo.originalKey,
      );
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'videos/user-1/video-1/playback.mp4',
      );
    });

    it('does not delete the shared object twice when playback = original', async () => {
      prisma.video.findUnique.mockResolvedValue({
        ...uploadingVideo,
        status: 'READY',
        s3UploadId: null,
        playbackKey: uploadingVideo.originalKey,
      });

      await service.delete('user-1', 'video-1');

      expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('URLs', () => {
    it('409s for a video that is not ready', async () => {
      prisma.video.findUnique.mockResolvedValue({
        ...uploadingVideo,
        status: 'PROCESSING',
      });

      await expect(
        service.playbackUrl('user-1', 'video-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('serves playback from the rendition and download from the original', async () => {
      prisma.video.findUnique.mockResolvedValue({
        ...uploadingVideo,
        status: 'READY',
        s3UploadId: null,
        playbackKey: 'videos/user-1/video-1/playback.mp4',
      });
      storage.presignGet.mockResolvedValue('https://signed/get');

      await service.playbackUrl('user-1', 'video-1');
      expect(storage.presignGet).toHaveBeenLastCalledWith(
        'videos/user-1/video-1/playback.mp4',
        3600,
      );

      await service.downloadUrl('user-1', 'video-1');
      expect(storage.presignGet).toHaveBeenLastCalledWith(
        uploadingVideo.originalKey,
        3600,
        'match.mp4',
      );
    });
  });
});
