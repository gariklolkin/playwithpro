import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementService } from './settlement.service';

const HOUR = 3_600_000;

/**
 * Clock-driven progression of paid sessions:
 * PAID_ESCROW → IN_PROGRESS at startsAt, IN_PROGRESS → AWAITING_CONFIRMATION
 * at endsAt, and AWAITING_CONFIRMATION → COMPLETED_PAID once the auto-confirm
 * window elapses with no player confirmation or dispute (a disputed session
 * is DISPUTED, so the clock never touches it). Attendance never drives these
 * transitions — a no-show session still auto-completes unless disputed.
 * Read paths normalize inline, so behavior never depends on sweep timing;
 * inline normalization only moves status — money is settled by the sweeps,
 * never from a read path.
 */
@Injectable()
export class SessionProgressionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SessionProgressionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settlement: SettlementService,
  ) {}

  onApplicationBootstrap(): void {
    void this.sweep();
  }

  /** Auto-confirm deadline of a session, from its end time. */
  autoConfirmAt(session: { endsAt: Date }): Date {
    const windowHours = this.config.getOrThrow<number>(
      'AUTO_CONFIRM_WINDOW_HOURS',
    );
    return new Date(session.endsAt.getTime() + windowHours * HOUR);
  }

  /** Pure: the status a paid session should have at `now`. */
  progressedStatus(
    session: { status: SessionStatus; startsAt: Date; endsAt: Date },
    now: number,
  ): SessionStatus {
    const started =
      session.status === SessionStatus.PAID_ESCROW ||
      session.status === SessionStatus.IN_PROGRESS;
    const ended =
      (started || session.status === SessionStatus.AWAITING_CONFIRMATION) &&
      session.endsAt.getTime() <= now;
    if (ended && this.autoConfirmAt(session).getTime() <= now) {
      return SessionStatus.COMPLETED_PAID;
    }
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
   * one) and returns it; used inline by session read paths. Never settles
   * money — an inline auto-confirm leaves the payment HELD for the sweep.
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
    const updated = await this.prisma.session.updateMany({
      where: { id: session.id, status: session.status },
      data: { status: target },
    });
    if (updated.count === 0) {
      // Lost a race with another normalizer or a user action; report reality.
      // A vanished row (test truncation) falls back to the caller's snapshot.
      const current = await this.prisma.session.findUnique({
        where: { id: session.id },
        select: { status: true },
      });
      return current ? { ...session, status: current.status } : session;
    }
    return { ...session, status: target };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const now = new Date();
    const autoConfirmBefore = new Date(
      now.getTime() -
        this.config.getOrThrow<number>('AUTO_CONFIRM_WINDOW_HOURS') * HOUR,
    );
    const due = await this.prisma.session.findMany({
      where: {
        OR: [
          { status: SessionStatus.PAID_ESCROW, startsAt: { lte: now } },
          { status: SessionStatus.IN_PROGRESS, endsAt: { lte: now } },
          {
            status: SessionStatus.AWAITING_CONFIRMATION,
            endsAt: { lte: autoConfirmBefore },
          },
        ],
      },
      select: { id: true, status: true, startsAt: true, endsAt: true },
    });
    for (const session of due) {
      try {
        const progressed = await this.normalize(session);
        if (progressed.status === SessionStatus.COMPLETED_PAID) {
          await this.settlement.settle(session.id);
        }
      } catch (error) {
        this.logger.error(
          `Failed to progress session ${session.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
