import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VideosService } from './videos.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes ready videos that have stayed unattached to any live session for
 * longer than the retention period. The clock (`Video.unattachedSince`) is
 * maintained by UnattachedVideosService; the library shows the expiry date
 * the whole time, so nothing disappears unannounced.
 */
@Injectable()
export class VideoRetentionService {
  private readonly logger = new Logger(VideoRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly videos: VideosService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweepExpiredVideos(): Promise<void> {
    try {
      await this.sweepOnce();
    } catch (error) {
      // A failed scan must not surface as an unhandled rejection from the
      // scheduler; the next tick retries.
      this.logger.error(
        'Video retention sweep failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async sweepOnce(): Promise<number> {
    const retentionDays = this.config.getOrThrow<number>(
      'VIDEO_UNATTACHED_RETENTION_DAYS',
    );
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    const expired = await this.prisma.video.findMany({
      where: { status: VideoStatus.READY, unattachedSince: { lt: cutoff } },
    });
    let swept = 0;
    for (const video of expired) {
      try {
        await this.videos.purge(video);
        swept += 1;
        this.logger.log(
          `Retention: deleted video ${video.id} of ${
            video.ownerId
          } (unattached since ${video.unattachedSince?.toISOString()})`,
        );
      } catch (error) {
        this.logger.error(
          `Retention: failed to delete video ${video.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return swept;
  }
}
