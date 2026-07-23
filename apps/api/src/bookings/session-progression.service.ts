import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Clock-driven progression of paid sessions:
 * PAID_ESCROW → IN_PROGRESS at startsAt, IN_PROGRESS → AWAITING_CONFIRMATION
 * at endsAt. Attendance never drives these transitions — a no-show session
 * still reaches AWAITING_CONFIRMATION, where change 9's dispute flow applies.
 * Read paths normalize inline, so behavior never depends on sweep timing.
 */
@Injectable()
export class SessionProgressionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SessionProgressionService.name);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    void this.sweep();
  }

  /** Pure: the status a paid session should have at `now`. */
  progressedStatus(
    session: { status: SessionStatus; startsAt: Date; endsAt: Date },
    now: number,
  ): SessionStatus {
    const started =
      session.status === SessionStatus.PAID_ESCROW ||
      session.status === SessionStatus.IN_PROGRESS;
    if (started && session.endsAt.getTime() <= now) {
      return SessionStatus.AWAITING_CONFIRMATION;
    }
    if (
      session.status === SessionStatus.PAID_ESCROW &&
      session.startsAt.getTime() <= now
    ) {
      return SessionStatus.IN_PROGRESS;
    }
    return session.status;
  }

  /**
   * Persists the clock-derived status (race-safe: conditional on the current
   * one) and returns it; used inline by session read paths.
   */
  async normalize<
    T extends {
      id: string;
      status: SessionStatus;
      startsAt: Date;
      endsAt: Date;
    },
  >(session: T): Promise<T> {
    const target = this.progressedStatus(session, Date.now());
    if (target === session.status) {
      return session;
    }
    await this.prisma.session.updateMany({
      where: { id: session.id, status: session.status },
      data: { status: target },
    });
    return { ...session, status: target };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.session.findMany({
      where: {
        OR: [
          { status: SessionStatus.PAID_ESCROW, startsAt: { lte: now } },
          { status: SessionStatus.IN_PROGRESS, endsAt: { lte: now } },
        ],
      },
      select: { id: true, status: true, startsAt: true, endsAt: true },
    });
    for (const session of due) {
      try {
        await this.normalize(session);
      } catch (error) {
        this.logger.error(
          `Failed to progress session ${session.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
