import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttendanceOutcome, ServiceType, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isOnlineService } from './session-access';
import { SettlementService } from './settlement.service';

const HOUR = 3_600_000;

/** What the clock needs to know about a session. */
export interface ProgressableSession {
  status: SessionStatus;
  startsAt: Date;
  endsAt: Date;
  serviceType: ServiceType;
  attendanceOutcome: AttendanceOutcome | null;
  coachConfirmedAt: Date | null;
}

/** The Prisma select matching {@link ProgressableSession}. */
export const PROGRESSION_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  serviceType: true,
  attendanceOutcome: true,
  coachConfirmedAt: true,
} as const;

/** Classifications that leave an online session on the normal payout path. */
const PAYABLE_OUTCOMES: AttendanceOutcome[] = [
  AttendanceOutcome.HELD,
  AttendanceOutcome.PLAYER_NO_SHOW,
];

/**
 * Clock-driven progression of paid sessions:
 * PAID_ESCROW → IN_PROGRESS at startsAt, IN_PROGRESS → AWAITING_CONFIRMATION
 * at endsAt, and AWAITING_CONFIRMATION → COMPLETED_PAID once the auto-confirm
 * window elapses with no player confirmation or dispute (a disputed session
 * is DISPUTED, so the clock never touches it). Auto-confirm follows the
 * evidence: an online session completes only once its attendance was
 * classified as held or a player no-show (every other outcome became a system
 * dispute — see NoShowService), and an in-person game only once its coach has
 * answered.
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
  progressedStatus(session: ProgressableSession, now: number): SessionStatus {
    const started =
      session.status === SessionStatus.PAID_ESCROW ||
      session.status === SessionStatus.IN_PROGRESS;
    const ended =
      (started || session.status === SessionStatus.AWAITING_CONFIRMATION) &&
      session.endsAt.getTime() <= now;
    if (
      ended &&
      this.autoConfirmAt(session).getTime() <= now &&
      this.payableByDefault(session)
    ) {
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

  /** Whether the auto-confirm deadline may pay the coach without anyone acting. */
  private payableByDefault(session: ProgressableSession): boolean {
    return isOnlineService(session.serviceType)
      ? session.attendanceOutcome !== null &&
          PAYABLE_OUTCOMES.includes(session.attendanceOutcome)
      : session.coachConfirmedAt !== null;
  }

  /**
   * Persists the clock-derived status (race-safe: conditional on the current
   * one) and returns it; used inline by session read paths. Never settles
   * money — an inline auto-confirm leaves the payment HELD for the sweep.
   */
  async normalize<T extends ProgressableSession & { id: string }>(
    session: T,
  ): Promise<T> {
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
    try {
      await this.sweepOnce();
    } catch (error) {
      // The scan itself can fail transiently (e.g. a deadlock against a
      // concurrent TRUNCATE in tests, or a DB blip in production); the next
      // tick retries, and a bootstrap kickoff must never leave an
      // unhandled rejection behind.
      this.logger.error(
        'Session progression sweep failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async sweepOnce(): Promise<void> {
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
      select: PROGRESSION_SELECT,
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
