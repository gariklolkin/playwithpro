import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { VideoRetentionService } from './video-retention.service';
import type { VideosService } from './videos.service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('VideoRetentionService', () => {
  const prisma = {
    video: {
      findMany: jest.fn<
        Promise<unknown[]>,
        [{ where: { status: string; unattachedSince: { lt: Date } } }]
      >(),
    },
  };
  const config = { getOrThrow: jest.fn().mockReturnValue(90) };
  const videos = { purge: jest.fn() };
  const service = new VideoRetentionService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    videos as unknown as VideosService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects only ready videos whose clock passed the retention cutoff', async () => {
    prisma.video.findMany.mockResolvedValue([]);
    const before = Date.now();

    await service.sweepOnce();

    const args = prisma.video.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('READY');
    const cutoff = args.where.unattachedSince.lt.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - 90 * DAY_MS);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - 90 * DAY_MS);
  });

  it('purges each expired video and keeps going after a failure', async () => {
    const a = { id: 'a', ownerId: 'u', unattachedSince: new Date() };
    const b = { id: 'b', ownerId: 'u', unattachedSince: new Date() };
    prisma.video.findMany.mockResolvedValue([a, b]);
    videos.purge.mockRejectedValueOnce(new Error('s3 down'));

    const swept = await service.sweepOnce();

    expect(videos.purge).toHaveBeenCalledTimes(2);
    expect(swept).toBe(1);
  });

  it('never lets a failed scan escape the cron entry point', async () => {
    prisma.video.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.sweepExpiredVideos()).resolves.toBeUndefined();
  });
});
