import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdminDisputeItem,
  AdminDisputeListResponse,
  DisputeKind as SharedDisputeKind,
  DisputeOutcome as SharedDisputeOutcome,
  DisputeReasonCategory as SharedDisputeReasonCategory,
  DisputeStatus as SharedDisputeStatus,
  SessionResponse,
} from '@playwithpro/shared';
import {
  AttendanceOutcome,
  Dispute,
  DisputeKind,
  DisputeOutcome,
  DisputeStatus,
  NotificationKind,
  ServiceType,
  SessionStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { BookingsService } from '../bookings/bookings.service';
import { DisputeResolutionService } from '../bookings/dispute-resolution.service';
import {
  toAttendanceSummary,
  toDisputeSummary,
  toPrismaDisputeKind,
  toPrismaReasonCategory,
} from '../bookings/dispute.mapper';
import { isOnlineService } from '../bookings/session-access';
import { SessionProgressionService } from '../bookings/session-progression.service';
import {
  ANALYTICS,
  LIFECYCLE_EVENTS,
  type Analytics,
} from '../observability/observability';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { PrismaService } from '../prisma/prisma.service';

type DisputeWithSession = Dispute & {
  session: {
    id: string;
    serviceType: ServiceType;
    startsAt: Date;
    endsAt: Date;
    priceMinor: number;
    currency: string;
    platformFeeMinor: number;
    playerId: string;
    attendanceOutcome: AttendanceOutcome | null;
    attendancePartial: boolean;
    classifiedAt: Date | null;
    player: { id: string; displayName: string };
    proProfile: {
      id: string;
      userId: string;
      user: { displayName: string };
    };
    attendance: Array<{
      userId: string;
      joinedAt: Date;
      connectedAt: Date | null;
      leftAt: Date | null;
      user: { displayName: string };
    }>;
  };
};

const DISPUTE_INCLUDE = {
  session: {
    select: {
      id: true,
      serviceType: true,
      startsAt: true,
      endsAt: true,
      priceMinor: true,
      currency: true,
      platformFeeMinor: true,
      playerId: true,
      attendanceOutcome: true,
      attendancePartial: true,
      classifiedAt: true,
      player: { select: { id: true, displayName: true } },
      proProfile: {
        select: {
          id: true,
          userId: true,
          user: { select: { displayName: true } },
        },
      },
      attendance: {
        orderBy: { joinedAt: 'asc' as const },
        select: {
          userId: true,
          joinedAt: true,
          connectedAt: true,
          leftAt: true,
          user: { select: { displayName: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly progression: SessionProgressionService,
    private readonly resolution: DisputeResolutionService,
    private readonly config: ConfigService,
    @Inject(ANALYTICS) private readonly analytics: Analytics,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Player-only escape hatch from the confirmation window: flips the session
   * to DISPUTED (freezing auto-confirm and the payout) and records the reason
   * category with its optional text. The status flip and the dispute row are one transaction, and the
   * conditional update makes a second open — or a race with the auto-confirm
   * sweep — lose cleanly.
   */
  async open(
    user: AuthenticatedUser,
    sessionId: string,
    category: SharedDisputeReasonCategory,
    reason?: string,
  ): Promise<SessionResponse> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        playerId: true,
        status: true,
        startsAt: true,
        endsAt: true,
        serviceType: true,
        attendanceOutcome: true,
        coachConfirmedAt: true,
        priceMinor: true,
        currency: true,
        proProfile: { select: { userId: true } },
      },
    });
    if (
      !session ||
      (session.playerId !== user.id && session.proProfile.userId !== user.id)
    ) {
      throw new NotFoundException();
    }
    if (session.playerId !== user.id) {
      throw new ForbiddenException('Only the player can open a dispute.');
    }
    // Persist the clock-derived status first so a session whose end time
    // just passed is disputable without waiting for the sweep.
    await this.progression.normalize(session);
    await this.prisma.$transaction(async (tx) => {
      const disputed = await tx.session.updateMany({
        where: { id: session.id, status: SessionStatus.AWAITING_CONFIRMATION },
        data: { status: SessionStatus.DISPUTED },
      });
      if (disputed.count === 0) {
        throw new ConflictException('This session cannot be disputed.');
      }
      await tx.dispute.create({
        data: {
          sessionId: session.id,
          kind: DisputeKind.PLAYER_REPORTED,
          openedById: user.id,
          reasonCategory: toPrismaReasonCategory(category),
          reason: reason?.trim() || null,
        },
      });
      // Receipt, hold notice and admin alerts ride in the same transaction;
      // none of them carries the reason text.
      const admins = await this.notifications.adminIds(tx);
      await this.notifications.enqueue(tx, [
        {
          kind: NotificationKind.DISPUTE_OPENED_PLAYER,
          sessionId: session.id,
          recipientId: user.id,
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
    });
    this.logger.log(`Dispute opened on session ${session.id}`);
    this.analytics.track({
      event: LIFECYCLE_EVENTS.sessionDisputed,
      distinctId: user.id,
      properties: {
        sessionId: session.id,
        serviceType: toSharedServiceType(session.serviceType),
        amountMinor: session.priceMinor,
        currency: session.currency,
      },
    });
    return this.bookings.sessionResponse(session.id);
  }

  /**
   * The coach's single statement on a system-opened dispute. It cancels the
   * pending automatic refund and leaves the case to an admin; the conditional
   * update decides a race with the deadline sweep (whichever lands first).
   */
  async respond(
    user: AuthenticatedUser,
    sessionId: string,
    statement: string,
  ): Promise<SessionResponse> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        playerId: true,
        proProfile: { select: { userId: true } },
        dispute: { select: { id: true, kind: true } },
      },
    });
    if (
      !session ||
      (session.playerId !== user.id && session.proProfile.userId !== user.id)
    ) {
      throw new NotFoundException();
    }
    if (session.proProfile.userId !== user.id) {
      throw new ForbiddenException('Only the coach can respond.');
    }
    if (
      !session.dispute ||
      session.dispute.kind === DisputeKind.PLAYER_REPORTED
    ) {
      throw new ConflictException('This session has no dispute to respond to.');
    }
    const responded = await this.prisma.dispute.updateMany({
      where: {
        id: session.dispute.id,
        status: DisputeStatus.OPEN,
        coachRespondedAt: null,
      },
      data: {
        coachResponse: statement.trim(),
        coachRespondedAt: new Date(),
        responseDueAt: null,
      },
    });
    if (responded.count === 0) {
      throw new ConflictException(
        'This dispute was already responded to or resolved.',
      );
    }
    this.logger.log(`Coach responded to dispute ${session.dispute.id}`);
    this.analytics.track({
      event: LIFECYCLE_EVENTS.disputeCoachResponded,
      distinctId: user.id,
      properties: {
        sessionId: session.id,
        kind: session.dispute.kind.toLowerCase(),
      },
    });
    return this.bookings.sessionResponse(session.id, user);
  }

  async listForAdmin(
    kind?: SharedDisputeKind,
  ): Promise<AdminDisputeListResponse> {
    const disputes = await this.prisma.dispute.findMany({
      where: kind ? { kind: toPrismaDisputeKind(kind) } : undefined,
      include: DISPUTE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    const noShows = await this.previousNoShows(disputes);
    const items = disputes.map((dispute) => this.toAdminItem(dispute, noShows));
    return {
      open: items.filter((item) => item.status === SharedDisputeStatus.Open),
      resolved: items
        .filter((item) => item.status === SharedDisputeStatus.Resolved)
        .reverse(),
    };
  }

  /**
   * Admin verdict: exactly one outcome, applied exactly once through the
   * shared resolution path (the same one the response deadline and the
   * player's confirmation of a system dispute use).
   */
  async resolve(
    adminId: string,
    disputeId: string,
    outcome: SharedDisputeOutcome,
    note?: string,
  ): Promise<AdminDisputeItem> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, sessionId: true },
    });
    if (!dispute) {
      throw new NotFoundException();
    }
    await this.resolution.resolve(
      dispute,
      outcome === SharedDisputeOutcome.Release
        ? DisputeOutcome.RELEASE
        : DisputeOutcome.REFUND,
      { type: 'admin', userId: adminId, note },
    );
    const fresh = await this.prisma.dispute.findUniqueOrThrow({
      where: { id: dispute.id },
      include: DISPUTE_INCLUDE,
    });
    this.analytics.track({
      event: LIFECYCLE_EVENTS.disputeResolved,
      distinctId: adminId,
      properties: {
        sessionId: fresh.session.id,
        serviceType: toSharedServiceType(fresh.session.serviceType),
        amountMinor: fresh.session.priceMinor,
        currency: fresh.session.currency,
        outcome,
      },
    });
    return this.toAdminItem(fresh, await this.previousNoShows([fresh]));
  }

  /**
   * Per coach profile: COACH_NO_SHOW disputes that ended in a refund
   * (automatically or by an admin). One grouped query for the whole page;
   * a listed dispute never counts towards its own "previous" number.
   */
  private async previousNoShows(
    disputes: DisputeWithSession[],
  ): Promise<Map<string, string[]>> {
    const profileIds = [
      ...new Set(disputes.map((dispute) => dispute.session.proProfile.id)),
    ];
    if (profileIds.length === 0) {
      return new Map();
    }
    const refunded = await this.prisma.dispute.findMany({
      where: {
        kind: DisputeKind.COACH_NO_SHOW,
        outcome: DisputeOutcome.REFUND,
        session: { proProfileId: { in: profileIds } },
      },
      select: { id: true, session: { select: { proProfileId: true } } },
    });
    const byProfile = new Map<string, string[]>();
    for (const row of refunded) {
      const ids = byProfile.get(row.session.proProfileId) ?? [];
      ids.push(row.id);
      byProfile.set(row.session.proProfileId, ids);
    }
    return byProfile;
  }

  private toAdminItem(
    dispute: DisputeWithSession,
    noShows: Map<string, string[]>,
  ): AdminDisputeItem {
    const session = dispute.session;
    const summary = toDisputeSummary(dispute);
    return {
      id: dispute.id,
      sessionId: session.id,
      status: summary.status,
      outcome: summary.outcome,
      kind: summary.kind,
      reasonCategory: summary.reasonCategory,
      reason: dispute.reason,
      adminNote: dispute.adminNote,
      responseDueAt: summary.responseDueAt,
      coachResponse: summary.coachResponse,
      coachRespondedAt: summary.coachRespondedAt,
      resolvedVia: summary.resolvedVia,
      systemNote: summary.systemNote,
      openedAt: dispute.createdAt.toISOString(),
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
      serviceType: toSharedServiceType(session.serviceType),
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      amountMinor: session.priceMinor,
      currency: session.currency,
      feeMinor: session.platformFeeMinor,
      player: session.player,
      coach: {
        id: session.proProfile.id,
        displayName: session.proProfile.user.displayName,
      },
      attendanceSummary: isOnlineService(session.serviceType)
        ? toAttendanceSummary(
            session,
            session.proProfile.userId,
            session.attendance,
            {
              beforeMin: this.config.getOrThrow<number>(
                'ROOM_JOIN_WINDOW_BEFORE_MIN',
              ),
              afterMin: this.config.getOrThrow<number>(
                'ROOM_JOIN_WINDOW_AFTER_MIN',
              ),
            },
          )
        : null,
      coachPreviousNoShows: (noShows.get(session.proProfile.id) ?? []).filter(
        (id) => id !== dispute.id,
      ).length,
      attendance: session.attendance.map((entry) => ({
        userId: entry.userId,
        displayName: entry.user.displayName,
        joinedAt: entry.joinedAt.toISOString(),
        connectedAt: entry.connectedAt?.toISOString() ?? null,
        leftAt: entry.leftAt?.toISOString() ?? null,
      })),
    };
  }
}
