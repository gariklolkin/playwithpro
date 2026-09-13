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
      create: jest.fn<Promise<unknown>, [{ data: Record<string, unknown> }]>(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn<
        Promise<unknown>,
        [{ where: Record<string, unknown>; data: Record<string, unknown> }]
      >(),
      delete: jest.fn(),
    },
    session: {
      findFirst: jest.fn<Promise<unknown>, [unknown]>(),
    },
    sessionVideo: { groupBy: jest.fn() },
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
  // 1 MB file limit and a 3 MB / 3-video library keep test numbers small.
  const config = {
    getOrThrow: (name: string) =>
      ({
        VIDEO_MAX_SIZE_MB: 1,
        VIDEO_MAX_DURATION_MIN: 30,
        SESSION_VIDEO_MAX_COUNT: 5,
        SESSION_VIDEO_MAX_TOTAL_MIN: 60,
        // 3 MB expressed in GB so the service's GB → bytes math is exercised.
        LIBRARY_MAX_TOTAL_GB: 3 / 1024,
        LIBRARY_MAX_VIDEOS: 3,
        VIDEO_UNATTACHED_RETENTION_DAYS: 90,
      })[name],
  };
  const usage = (count: number, usedBytes: number) => ({
    _sum: { sizeBytes: BigInt(usedBytes) },
    _count: { _all: count },
  });

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
    unattachedSince: null,
    createdAt: new Date('2026-07-20T10:00:00Z'),
    updatedAt: new Date('2026-07-20T10:00:00Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.video.aggregate.mockResolvedValue(usage(0, 0));
    prisma.sessionVideo.groupBy.mockResolvedValue([]);
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
      // The declared size counts against the quota while in flight.
      expect(data.sizeBytes).toBe(BigInt(1024));
    });

    it('refuses initiation once the library holds the maximum number of videos', async () => {
      prisma.video.aggregate.mockResolvedValue(usage(3, 1024));

      const attempt = service.createUpload('user-1', {
        fileName: 'one-more.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1024,
      });
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({
        response: { reason: 'library_full_count', maxVideos: 3 },
      });
      expect(storage.createMultipartUpload).not.toHaveBeenCalled();
      expect(prisma.video.create).not.toHaveBeenCalled();
    });

    it('refuses initiation when the declared size exceeds the remaining quota', async () => {
      prisma.video.aggregate.mockResolvedValue(usage(2, 2.5 * 1024 * 1024));

      const attempt = service.createUpload('user-1', {
        fileName: 'big.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1024 * 1024,
      });
      await expect(attempt).rejects.toMatchObject({
        response: {
          reason: 'library_full_bytes',
          remainingBytes: 0.5 * 1024 * 1024,
        },
      });
      expect(storage.createMultipartUpload).not.toHaveBeenCalled();
    });

    it('counts only non-rejected videos toward the quota', async () => {
      storage.createMultipartUpload.mockResolvedValue('upload-1');
      prisma.video.create.mockResolvedValue(uploadingVideo);

      await service.createUpload('user-1', {
        fileName: 'ok.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1024,
      });

      expect(prisma.video.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'user-1', status: { not: 'REJECTED' } },
        }),
      );
    });
  });

  describe('list', () => {
    it('returns the limits with usage and the expiry of unattached ready videos', async () => {
      const unattachedSince = new Date('2026-09-01T00:00:00Z');
      prisma.video.findMany.mockResolvedValue([
        { ...uploadingVideo, id: 'v-ready', status: 'READY', unattachedSince },
        { ...uploadingVideo, id: 'v-attached', status: 'READY' },
        { ...uploadingVideo, id: 'v-up' },
      ]);
      prisma.video.aggregate.mockResolvedValue(usage(3, 2048));
      prisma.sessionVideo.groupBy.mockResolvedValue([
        { videoId: 'v-attached', _count: { _all: 2 } },
      ]);

      const result = await service.list('user-1');

      expect(result.limits).toEqual({
        file: { maxSizeBytes: 1024 * 1024, maxDurationSeconds: 1800 },
        session: { maxClips: 5, maxTotalSeconds: 3600 },
        library: {
          maxBytes: 3 * 1024 * 1024,
          maxVideos: 3,
          usedBytes: 2048,
          count: 3,
        },
      });
      const byId = new Map(result.videos.map((video) => [video.id, video]));
      expect(byId.get('v-ready')?.expiresAt).toBe('2026-11-30T00:00:00.000Z');
      expect(byId.get('v-ready')?.attachedUpcomingSessions).toBe(0);
      expect(byId.get('v-attached')?.expiresAt).toBeNull();
      expect(byId.get('v-attached')?.attachedUpcomingSessions).toBe(2);
      expect(byId.get('v-up')?.expiresAt).toBeNull();
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

  describe('per-session coach access', () => {
    const readyVideo = {
      ...uploadingVideo,
      status: 'READY',
      s3UploadId: null,
      playbackKey: 'videos/user-1/video-1/playback.mp4',
    };

    it('grants playback to the coach of a qualifying session', async () => {
      prisma.video.findUnique.mockResolvedValue(readyVideo);
      prisma.session.findFirst.mockResolvedValue({ id: 'session-1' });
      storage.presignGet.mockResolvedValue('https://signed/get');

      await expect(
        service.playbackUrl('coach-1', 'video-1'),
      ).resolves.toBeDefined();
      expect(prisma.session.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            videos: { some: { videoId: 'video-1' } },
            proProfile: { userId: 'coach-1' },
          }) as object,
        }),
      );
    });

    it('scopes the qualifying-session lookup to paid, non-cancelled states', async () => {
      prisma.video.findUnique.mockResolvedValue(readyVideo);
      prisma.session.findFirst.mockResolvedValue(null);

      await expect(service.get('coach-1', 'video-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const args = prisma.session.findFirst.mock.calls[0][0] as {
        where: { status: { in: string[] } };
      };
      expect(args.where.status.in).toContain('PAID_ESCROW');
      expect(args.where.status.in).not.toContain('PENDING_PAYMENT');
      expect(args.where.status.in).not.toContain('CANCELLED');
    });

    it('keeps management owner-only even for the session coach', async () => {
      prisma.video.findUnique.mockResolvedValue(readyVideo);
      prisma.session.findFirst.mockResolvedValue({ id: 'session-1' });

      await expect(
        service.rename('coach-1', 'video-1', { title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.delete('coach-1', 'video-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.downloadUrl('coach-1', 'video-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('owner access does not consult sessions', async () => {
      prisma.video.findUnique.mockResolvedValue(readyVideo);

      await service.get('user-1', 'video-1');

      expect(prisma.session.findFirst).not.toHaveBeenCalled();
    });
  });
});
