import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

/**
 * Safety net for unpaid bookings: the pay/read paths already check the
 * deadline inline, so behavior never depends on sweep timing — this just
 * keeps slots from staying claimed by abandoned checkouts.
 */
@Injectable()
export class BookingExpiryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BookingExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

  onApplicationBootstrap(): void {
    // Mirrors video-processing recovery: catch up on whatever expired
    // while the API was down.
    void this.sweep();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    try {
      await this.sweepOnce();
    } catch (error) {
      // The scan itself can fail transiently (e.g. a deadlock against a
      // concurrent TRUNCATE in tests, or a DB blip in production); the next
      // tick retries, and a bootstrap kickoff must never leave an
      // unhandled rejection behind.
      this.logger.error(
        'Booking expiry sweep failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async sweepOnce(): Promise<void> {
    const overdue = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.PENDING_PAYMENT,
        expiresAt: { lte: new Date() },
      },
      select: { id: true },
    });
    for (const session of overdue) {
      try {
        await this.bookings.expireSession(session.id);
      } catch (error) {
        this.logger.error(
          `Failed to expire session ${session.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
