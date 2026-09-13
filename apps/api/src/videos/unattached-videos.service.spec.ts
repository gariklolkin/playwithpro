import type { PrismaService } from '../prisma/prisma.service';
import { UnattachedVideosService } from './unattached-videos.service';

describe('UnattachedVideosService.recompute', () => {
  const prisma = {
    sessionVideo: { findMany: jest.fn() },
    video: { updateMany: jest.fn() },
  };
  const service = new UnattachedVideosService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing for an empty list', async () => {
    await service.recompute([]);
    expect(prisma.sessionVideo.findMany).not.toHaveBeenCalled();
  });

  it('clears the clock on live-attached clips and starts it on the rest', async () => {
    prisma.sessionVideo.findMany.mockResolvedValue([{ videoId: 'v1' }]);

    await service.recompute(['v1', 'v2', 'v2']);

    expect(prisma.sessionVideo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          videoId: { in: ['v1', 'v2'] },
          session: { status: { not: 'CANCELLED' } },
        },
      }),
    );
    expect(prisma.video.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['v1'] } },
      data: { unattachedSince: null },
    });
    // Only ready videos with no running clock get a fresh start: the clock
    // is never reset while it runs.
    expect(prisma.video.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['v2'] }, status: 'READY', unattachedSince: null },
      data: { unattachedSince: expect.any(Date) as Date },
    });
  });
});
