import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { VideoRejectionReason } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { VideoProcessingService } from './video-processing.service';

const mockExecFile = jest.fn<Promise<{ stdout: string }>, unknown[]>();

jest.mock('node:child_process', () => {
  const actual = jest.requireActual<object>('node:child_process');
  const { promisify } =
    jest.requireActual<typeof import('node:util')>('node:util');
  const fake = () => {
    throw new Error('callback-style execFile is not expected in tests');
  };
  (fake as unknown as Record<symbol, unknown>)[promisify.custom] = (
    ...args: unknown[]
  ) => mockExecFile(...args);
  return { ...actual, execFile: fake };
});

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual<object>('node:fs/promises'),
  mkdtemp: jest.fn().mockResolvedValue('/tmp/video-transcode-x'),
  rm: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 1234 }),
}));

jest.mock('node:fs', () => ({
  ...jest.requireActual<object>('node:fs'),
  createReadStream: jest.fn().mockReturnValue('stream'),
}));

function probeStdout(overrides: {
  codec?: string;
  duration?: number;
  noVideoStream?: boolean;
}): string {
  return JSON.stringify({
    format: {
      duration: String(overrides.duration ?? 60),
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    },
    streams: overrides.noVideoStream
      ? [{ codec_type: 'audio', codec_name: 'aac' }]
      : [
          {
            codec_type: 'video',
            codec_name: overrides.codec ?? 'h264',
            width: 1920,
            height: 1080,
            avg_frame_rate: '60/1',
          },
        ],
  });
}

describe('VideoProcessingService', () => {
  let service: VideoProcessingService;

  const prisma = {
    video: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
    },
  };
  const storage = {
    presignGetInternal: jest.fn().mockResolvedValue('http://minio/signed'),
    deleteObject: jest.fn(),
    putObject: jest.fn().mockResolvedValue(undefined),
    abortMultipartUpload: jest.fn(),
  };
  const config = {
    getOrThrow: (name: string) =>
      ({ VIDEO_MAX_SIZE_MB: 2048, VIDEO_MAX_DURATION_MIN: 30 })[name],
  };

  const processingVideo = {
    id: 'video-1',
    ownerId: 'user-1',
    status: 'PROCESSING',
    originalKey: 'videos/user-1/video-1/original.mp4',
  };

  const process = (id: string): Promise<void> =>
    (
      service as unknown as { process: (id: string) => Promise<void> }
    ).process(id);

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.video.update.mockResolvedValue({});
    const moduleRef = await Test.createTestingModule({
      providers: [
        VideoProcessingService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(VideoProcessingService);
  });

  it('rejects a file ffprobe cannot parse and deletes the object', async () => {
    prisma.video.findUnique.mockResolvedValue(processingVideo);
    mockExecFile.mockRejectedValue(new Error('invalid data'));

    await process('video-1');

    expect(storage.deleteObject).toHaveBeenCalledWith(
      processingVideo.originalKey,
    );
    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      data: {
        status: 'REJECTED',
        rejectionReason: VideoRejectionReason.NotAVideo,
      },
    });
  });

  it('rejects a file with no video stream', async () => {
    prisma.video.findUnique.mockResolvedValue(processingVideo);
    mockExecFile.mockResolvedValue({
      stdout: probeStdout({ noVideoStream: true }),
    });

    await process('video-1');

    expect(prisma.video.update.mock.calls[0][0].data.rejectionReason).toBe(
      VideoRejectionReason.NotAVideo,
    );
  });

  it('rejects an over-duration video', async () => {
    prisma.video.findUnique.mockResolvedValue(processingVideo);
    mockExecFile.mockResolvedValue({
      stdout: probeStdout({ duration: 31 * 60 }),
    });

    await process('video-1');

    expect(prisma.video.update.mock.calls[0][0].data.rejectionReason).toBe(
      VideoRejectionReason.TooLong,
    );
    expect(storage.deleteObject).toHaveBeenCalled();
  });

  it('skips the transcode for an H.264 mp4 and reuses the original', async () => {
    prisma.video.findUnique.mockResolvedValue(processingVideo);
    mockExecFile.mockResolvedValue({ stdout: probeStdout({ codec: 'h264' }) });

    await process('video-1');

    // Only ffprobe ran — no ffmpeg invocation.
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const readyUpdate = prisma.video.update.mock.calls.at(-1)[0];
    expect(readyUpdate.data).toEqual({
      status: 'READY',
      playbackKey: processingVideo.originalKey,
    });
    // Metadata persisted from the probe.
    const metadataUpdate = prisma.video.update.mock.calls[0][0];
    expect(metadataUpdate.data.fps).toBe(60);
    expect(metadataUpdate.data.codec).toBe('h264');
  });

  it('transcodes a non-browser-safe source and uploads the rendition', async () => {
    prisma.video.findUnique.mockResolvedValue({
      ...processingVideo,
      originalKey: 'videos/user-1/video-1/original.mov',
    });
    mockExecFile.mockResolvedValue({ stdout: probeStdout({ codec: 'hevc' }) });

    await process('video-1');

    expect(mockExecFile).toHaveBeenCalledTimes(2);
    const ffmpegArgs = mockExecFile.mock.calls[1][1] as string[];
    expect(ffmpegArgs).toContain('libx264');
    expect(ffmpegArgs).toContain('+faststart');
    expect(storage.putObject).toHaveBeenCalledWith(
      'videos/user-1/video-1/playback.mp4',
      'stream',
      'video/mp4',
      1234,
    );
    const readyUpdate = prisma.video.update.mock.calls.at(-1)[0];
    expect(readyUpdate.data.playbackKey).toBe(
      'videos/user-1/video-1/playback.mp4',
    );
  });

  it('re-queues videos stuck in PROCESSING on startup', async () => {
    prisma.video.findMany.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]);
    const enqueue = jest
      .spyOn(service, 'enqueue')
      .mockImplementation(() => undefined);

    await service.onModuleInit();

    expect(enqueue).toHaveBeenCalledWith('v1');
    expect(enqueue).toHaveBeenCalledWith('v2');
  });

  it('sweeps stale uploads: aborts multipart and deletes rows', async () => {
    prisma.video.findMany.mockResolvedValue([
      {
        id: 'stale-1',
        originalKey: 'videos/u/stale-1/original.mp4',
        s3UploadId: 'upload-9',
      },
    ]);

    await service.sweepStaleUploads();

    expect(storage.abortMultipartUpload).toHaveBeenCalledWith(
      'videos/u/stale-1/original.mp4',
      'upload-9',
    );
    expect(prisma.video.delete).toHaveBeenCalledWith({
      where: { id: 'stale-1' },
    });
    const where = prisma.video.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('UPLOADING');
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });
});
