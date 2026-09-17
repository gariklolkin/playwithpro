import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AttendanceOutcome,
  DisputeKind,
  DisputeOutcome,
  DisputeStatus,
  NotificationKind,
  Prisma,
  ServiceType,
  SessionStatus,
} from '@prisma/client';
import {
  DisputeResolutionService,
  SYSTEM_NOTE_NO_COACH_RESPONSE,
} from '../bookings/dispute-resolution.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ANALYTICS,
  LIFECYCLE_EVENTS,
  type Analytics,
} from '../observability/observability';
import { PrismaService } from '../prisma/prisma.service';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { classifyAttendance } from '../session-rooms/attendance-classifier';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Classifications that stop the payout and hand the case to a dispute. */
const DISPUTE_KIND_OF: Partial<Record<AttendanceOutcome, DisputeKind>> = {
  [AttendanceOutcome.COACH_NO_SHOW]: DisputeKind.COACH_NO_SHOW,
  [AttendanceOutcome.NO_ATTENDANCE]: DisputeKind.NO_ATTENDANCE,
  [AttendanceOutcome.EVIDENCE_GAP]: DisputeKind.EVIDENCE_GAP,
};

/** Kinds the response deadline may refund without an admin. */
const AUTO_RESOLVABLE: DisputeKind[] = [
  DisputeKind.COACH_NO_SHOW,
  DisputeKind.NO_ATTENDANCE,
];

const CLASSIFY_SELECT = {
  id: true,
  playerId: true,
  startsAt: true,
  endsAt: true,
  serviceType: true,
  priceMinor: true,
  currency: true,
  proProfile: { select: { userId: true } },
  attendance: {
    select: { userId: true, joinedAt: true, connectedAt: true, leftAt: true },
  },
} as const satisfies Prisma.SessionSelect;

type ClassifiableSession = Prisma.SessionGetPayload<{
  select: typeof CLASSIFY_SELECT;
}>;

/**
 * Makes the default payout follow the evidence. Once the join window of an
 * online session has closed (plus a buffer for late provider reports) the
 * session is classified exactly once; a coach no-show, an empty room or an
 * evidence gap opens a system dispute through the same conditional
 * AWAITING_CONFIRMATION→DISPUTED flip a player dispute uses, so auto-confirm
 * and the payout stop the same way. Uncontested no-shows are refunded at the
 * coach's response deadline through the shared resolution path; evidence
 * gaps and games always wait for an admin. In-person games have no evidence:
 * a game whose coach stays silent becomes an admin dispute after a few days.
 *
 * Every step is conditional on the current state, so a player who confirms
 * or disputes at the same moment simply wins.
 */
@Injectable()
export class NoShowService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NoShowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly resolution: DisputeResolutionService,
    private readonly notifications: NotificationsService,
    @Inject(ANALYTICS) private readonly analytics: Analytics,
  ) {}

  onApplicationBootstrap(): void {
    void this.sweep();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      await this.sweepOnce();
    } catch (error) {
      // A transient scan failure (DB blip, a TRUNCATE in tests) is retried on
      // the next tick; a bootstrap kickoff must never leave an unhandled
      // rejection behind.
      this.logger.error(
        'No-show sweep failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** One pass of all three steps; public for tests driving the clock. */
  async sweepOnce(now = new Date()): Promise<void> {
    await this.classifyDue(now);
    await this.disputeUnansweredGames(now);
    await this.autoResolveDue(now);
  }

  private get autoResolve(): boolean {
    return this.config.getOrThrow<string>('NO_SHOW_AUTO_RESOLVE') === 'true';
  }

  private async classifyDue(now: Date): Promise<void> {
    const afterMin = this.config.getOrThrow<number>(
      'ROOM_JOIN_WINDOW_AFTER_MIN',
    );
    const bufferMin = this.config.getOrThrow<number>(
      'NO_SHOW_CLASSIFY_BUFFER_MIN',
    );
    const due = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.AWAITING_CONFIRMATION,
        classifiedAt: null,
        serviceType: { not: ServiceType.GAME },
        endsAt: {
          lte: new Date(now.getTime() - (afterMin + bufferMin) * MINUTE),
        },
      },
      select: CLASSIFY_SELECT,
    });
    for (const session of due) {
      try {
        await this.classify(session, now);
      } catch (error) {
        this.logger.error(
          `Failed to classify session ${session.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async classify(
    session: ClassifiableSession,
    now: Date,
  ): Promise<void> {
    const facts = classifyAttendance({
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      windowBeforeMin: this.config.getOrThrow<number>(
        'ROOM_JOIN_WINDOW_BEFORE_MIN',
      ),
      windowAfterMin: this.config.getOrThrow<number>(
        'ROOM_JOIN_WINDOW_AFTER_MIN',
      ),
      playerId: session.playerId,
      coachId: session.proProfile.userId,
      rows: session.attendance,
    });
    const kind = DISPUTE_KIND_OF[facts.outcome];
    const classified = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.session.updateMany({
        where: {
          id: session.id,
          status: SessionStatus.AWAITING_CONFIRMATION,
          classifiedAt: null,
        },
        data: {
          attendanceOutcome: facts.outcome,
          attendancePartial: facts.partial,
          classifiedAt: now,
          ...(kind ? { status: SessionStatus.DISPUTED } : {}),
        },
      });
      if (claimed.count === 0) {
        // The player confirmed or disputed first; their action stands.
        return false;
      }
      if (kind) {
        await this.openDispute(tx, session, kind, now, true);
      }
      return true;
    });
    if (!classified) {
      return;
    }
    this.logger.log(`Session ${session.id} classified as ${facts.outcome}`);
    this.analytics.track({
      event: LIFECYCLE_EVENTS.sessionClassified,
      distinctId: session.playerId,
      properties: {
        sessionId: session.id,
        serviceType: toSharedServiceType(session.serviceType),
        outcome: facts.outcome.toLowerCase(),
        partial: facts.partial,
      },
    });
  }

  /** A game with no answer from the coach for too long goes to an admin. */
  private async disputeUnansweredGames(now: Date): Promise<void> {
    const days = this.config.getOrThrow<number>('GAME_UNANSWERED_DISPUTE_DAYS');
    const due = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.AWAITING_CONFIRMATION,
        serviceType: ServiceType.GAME,
        coachConfirmedAt: null,
        endsAt: { lte: new Date(now.getTime() - days * DAY) },
      },
      select: CLASSIFY_SELECT,
    });
    for (const session of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.session.updateMany({
            where: {
              id: session.id,
              status: SessionStatus.AWAITING_CONFIRMATION,
              coachConfirmedAt: null,
            },
            data: { status: SessionStatus.DISPUTED },
          });
          if (claimed.count === 1) {
            await this.openDispute(
              tx,
              session,
              DisputeKind.NO_ATTENDANCE,
              now,
              false,
            );
          }
        });
      } catch (error) {
        this.logger.error(
          `Failed to open a dispute for unanswered game ${session.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * The dispute row and its notifications, inside the caller's transaction
   * (the session was already flipped to DISPUTED there). A response deadline
   * is set only where an automatic refund may follow.
   */
  private async openDispute(
    tx: Prisma.TransactionClient,
    session: ClassifiableSession,
    kind: DisputeKind,
    now: Date,
    fromClassification: boolean,
  ): Promise<void> {
    const deadline =
      fromClassification && this.autoResolve && AUTO_RESOLVABLE.includes(kind)
        ? new Date(
            now.getTime() +
              this.config.getOrThrow<number>('NO_SHOW_RESPONSE_WINDOW_HOURS') *
                HOUR,
          )
        : null;
    await tx.dispute.create({
      data: { sessionId: session.id, kind, responseDueAt: deadline },
    });
    const admins = await this.notifications.adminIds(tx);
    await this.notifications.enqueue(tx, [
      {
        kind: NotificationKind.DISPUTE_OPENED_PLAYER,
        sessionId: session.id,
        recipientId: session.playerId,
      },
      {
        kind: NotificationKind.DISPUTE_OPENED_COACH,
        sessionId: session.id,
        recipientId: session.proProfile.userId,
      },
      ...admins.map((adminId) => ({
        kind: NotificationKind.DISPUTE_OPENED_ADMIN,
        sessionId: session.id,
        recipientId: adminId,
      })),
    ]);
    this.logger.log(`System dispute ${kind} opened on session ${session.id}`);
  }

  /** Refunds uncontested no-shows whose response deadline has passed. */
  private async autoResolveDue(now: Date): Promise<void> {
    if (!this.autoResolve) {
      // Kill switch: already-open disputes freeze too.
      return;
    }
    const due = await this.prisma.dispute.findMany({
      where: {
        status: DisputeStatus.OPEN,
        kind: { in: AUTO_RESOLVABLE },
        coachRespondedAt: null,
        responseDueAt: { lte: now },
      },
      select: {
        id: true,
        sessionId: true,
        kind: true,
        session: { select: { playerId: true } },
      },
    });
    for (const dispute of due) {
      try {
        await this.resolution.resolve(dispute, DisputeOutcome.REFUND, {
          type: 'system',
          noteCode: SYSTEM_NOTE_NO_COACH_RESPONSE,
        });
        this.analytics.track({
          event: LIFECYCLE_EVENTS.disputeAutoResolved,
          distinctId: dispute.session.playerId,
          properties: {
            sessionId: dispute.sessionId,
            kind: dispute.kind.toLowerCase(),
          },
        });
      } catch (error) {
        // An admin, the player's confirmation or the coach's response
        // landing first surfaces as a conflict here — what landed stands.
        this.logger.warn(
          `Automatic resolution of dispute ${dispute.id} skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
