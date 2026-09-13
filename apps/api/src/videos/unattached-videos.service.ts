import { Injectable } from '@nestjs/common';
import { SessionStatus, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Keeps `Video.unattachedSince` — the retention clock — in step with the
 * attachment table. A clip attached to any live (not cancelled) session has
 * no clock; the clock starts when the last such attachment goes away and is
 * never reset while it runs.
 */
@Injectable()
export class UnattachedVideosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Live attachment = a row on a session that is not cancelled (expired bookings are cancelled too). */
  static readonly LIVE_SESSION = {
    status: { not: SessionStatus.CANCELLED },
  } as const;

  async recompute(videoIds: string[]): Promise<void> {
    const ids = [...new Set(videoIds)];
    if (ids.length === 0) return;
    const live = await this.prisma.sessionVideo.findMany({
      where: {
        videoId: { in: ids },
        session: UnattachedVideosService.LIVE_SESSION,
      },
      select: { videoId: true },
      distinct: ['videoId'],
    });
    const liveIds = live.map((row) => row.videoId);
    const idleIds = ids.filter((id) => !liveIds.includes(id));
    if (liveIds.length > 0) {
      await this.prisma.video.updateMany({
        where: { id: { in: liveIds } },
        data: { unattachedSince: null },
      });
    }
    if (idleIds.length > 0) {
      await this.prisma.video.updateMany({
        where: {
          id: { in: idleIds },
          status: VideoStatus.READY,
          unattachedSince: null,
        },
        data: { unattachedSince: new Date() },
      });
    }
  }
}
