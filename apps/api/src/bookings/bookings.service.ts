import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CoachGameAnswer as SharedCoachGameAnswer,
  DEFAULT_LOCALE,
  LegalAcceptanceContext,
  LegalDocument,
  PaySessionResponse,
  currentLegalVersion,
  PaymentStatus as SharedPaymentStatus,
  Role,
  SessionListResponse,
  SessionResponse,
  ServiceType as SharedServiceType,
} from '@playwithpro/shared';
import {
  CancellationTier,
  CancelledBy,
  DisputeKind,
  DisputeOutcome,
  DisputeStatus,
  PaymentStatus,
  Prisma,
  ProProfileStatus,
  SessionStatus,
  NotificationKind,
  SlotStatus,
} from '@prisma/client';
import { MIN_NOTICE_MS } from '../availability/availability.service';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { LegalService } from '../legal/legal.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ANALYTICS,
  LIFECYCLE_EVENTS,
  type Analytics,
} from '../observability/observability';
import type { PaymentProvider } from '../payments/payment-provider';
import {
  PAYMENT_PROVIDER,
  computePlatformFee,
} from '../payments/payment-provider';
import {
  toPrismaServiceType,
  toSharedServiceType,
} from '../pros/pro-profile.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UnattachedVideosService } from '../videos/unattached-videos.service';
import {
  cancellationTerms,
  coachProposalOutstanding,
  policyOf,
  toPolicyColumns,
  type CancellationActor,
  type CancellationPolicySnapshot,
} from './cancellation-policy';
import { DisputeResolutionService } from './dispute-resolution.service';
import { toPrismaGameAnswer } from './dispute.mapper';
import { supersedeOpenProposal } from './reschedule-slots';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaySessionDto } from './dto/pay-session.dto';
import { assertEditableBeforeStart, isOnlineService } from './session-access';
import { SessionProgressionService } from './session-progression.service';
import { SessionVideosService, ValidatedClip } from './session-videos.service';
import { SettlementService } from './settlement.service';
import {
  SESSION_INCLUDE,
  SessionResponseExtras,
  SessionWithParties,
  toSessionResponse,
} from './session.mapper';
import { isDeparting } from '../account-data/departing';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const PAYMENT_PROVIDER_NAME = 'mock';

/** A coach's late cancellations inside the rolling window ending at `now`. */
export function lateCancellationsWhere(
  proProfileId: string | { in: string[] },
  now: Date,
): Prisma.SessionWhereInput {
  return {
    proProfileId,
    cancelledBy: CancelledBy.COACH,
    cancellationLate: true,
    cancelledAt: {
      gte: new Date(
        now.getTime() - BookingsService.LATE_CANCELLATION_WINDOW_DAYS * DAY,
      ),
    },
  };
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly progression: SessionProgressionService,
    private readonly settlement: SettlementService,
    private readonly resolution: DisputeResolutionService,
    private readonly sessionVideos: SessionVideosService,
    private readonly unattached: UnattachedVideosService,
    @Inject(ANALYTICS) private readonly analytics: Analytics,
    private readonly notifications: NotificationsService,
    private readonly legal: LegalService,
  ) {}

  private readonly avatarUrlOf = (key: string): string =>
    this.storage.avatarUrl(key);

  /** The platform's cancellation policy as configured right now. */
  currentPolicy(): CancellationPolicySnapshot {
    return {
      freeHours: this.config.getOrThrow<number>('CANCELLATION_FREE_HOURS'),
      lateRefundPercent: this.config.getOrThrow<number>(
        'CANCELLATION_LATE_REFUND_PERCENT',
      ),
      noRefundHours: this.config.getOrThrow<number>(
        'CANCELLATION_NO_REFUND_HOURS',
      ),
      graceMin: this.config.getOrThrow<number>('CANCELLATION_GRACE_MIN'),
    };
  }

  private responseExtras(): SessionResponseExtras {
    return {
      roomWindow: {
        beforeMin: this.config.getOrThrow<number>(
          'ROOM_JOIN_WINDOW_BEFORE_MIN',
        ),
        afterMin: this.config.getOrThrow<number>('ROOM_JOIN_WINDOW_AFTER_MIN'),
      },
      autoConfirmWindowHours: this.config.getOrThrow<number>(
        'AUTO_CONFIRM_WINDOW_HOURS',
      ),
      rescheduleMax: this.config.getOrThrow<number>(
        'RESCHEDULE_MAX_PER_SESSION',
      ),
    };
  }

  async create(
    playerId: string,
    dto: CreateBookingDto,
  ): Promise<SessionResponse> {
    const serviceType = toPrismaServiceType(dto.serviceType);
    const profile = await this.prisma.proProfile.findUnique({
      where: { id: dto.proId },
      include: {
        services: { where: { type: serviceType } },
        user: { select: { deletionScheduledFor: true, deletedAt: true } },
      },
    });
    if (
      !profile ||
      profile.status !== ProProfileStatus.VERIFIED ||
      isDeparting(profile.user)
    ) {
      throw new NotFoundException();
    }
    const service = profile.services[0];
    if (!service || !service.active) {
      throw new BadRequestException('The coach does not offer this service.');
    }
    const clips = await this.validateVideoRules(playerId, dto);

    const slot = await this.prisma.availabilitySlot.findUnique({
      where: { id: dto.slotId },
    });
    if (!slot || slot.profileId !== profile.id) {
      throw new NotFoundException();
    }
    if (
      slot.status !== SlotStatus.OPEN ||
      slot.startsAt.getTime() <= Date.now() + MIN_NOTICE_MS
    ) {
      throw new ConflictException('This slot is no longer bookable.');
    }

    const ttlMinutes = this.config.getOrThrow<number>(
      'BOOKING_PAYMENT_TTL_MIN',
    );
    const feePercent = this.config.getOrThrow<number>('PLATFORM_FEE_PERCENT');
    const session = await this.prisma.$transaction(async (tx) => {
      // The conditional update is the race guard: whoever flips OPEN→BOOKED
      // owns the slot; everyone else sees 0 affected rows.
      const claimed = await tx.availabilitySlot.updateMany({
        where: { id: slot.id, status: SlotStatus.OPEN },
        data: { status: SlotStatus.BOOKED },
      });
      if (claimed.count === 0) {
        throw new ConflictException('This slot is no longer bookable.');
      }
      return tx.session.create({
        data: {
          playerId,
          proProfileId: profile.id,
          serviceType,
          priceMinor: service.priceMinor,
          currency: service.currency,
          platformFeeMinor: computePlatformFee(service.priceMinor, feePercent),
          slotId: slot.id,
          videos: { create: this.sessionVideos.rowsFor(clips) },
          goal: normalizeGoal(dto.goal),
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          expiresAt: new Date(Date.now() + ttlMinutes * MINUTE),
          // The cancellation terms in force now travel with the booking,
          // like the price: a later config change never reaches it.
          ...toPolicyColumns(this.currentPolicy()),
        },
        include: SESSION_INCLUDE,
      });
    });
    // Attaching stops the retention clock on the clips.
    await this.unattached.recompute(clips.map((clip) => clip.video.id));
    return toSessionResponse(session, this.avatarUrlOf);
  }

  /** Player-only replace of the clip set; see SessionVideosService. */
  async updateVideos(
    playerId: string,
    sessionId: string,
    inputs: CreateBookingDto['videos'] & object,
  ): Promise<SessionResponse> {
    await this.sessionVideos.replace(playerId, sessionId, inputs);
    return this.sessionResponse(sessionId);
  }

  /**
   * Player-only edit of the goal under the same rule as the clip set:
   * unpaid or paid, before the slot starts. The coach reads it through the
   * session data (paid-session rule for the card, the goal for both).
   */
  async updateGoal(
    user: AuthenticatedUser,
    sessionId: string,
    goal: string | null,
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    if (session.playerId !== user.id) {
      throw new ForbiddenException('Only the player can change the goal.');
    }
    const current = await this.progression.normalize(session);
    assertEditableBeforeStart(
      current,
      'The goal of this session can no longer be changed.',
    );
    await this.prisma.session.update({
      where: { id: session.id },
      data: { goal: normalizeGoal(goal) },
    });
    return this.sessionResponse(session.id, user);
  }

  async list(user: AuthenticatedUser): Promise<SessionListResponse> {
    const where = this.partyFilter(user);
    const sessions = await this.prisma.session.findMany({
      where: {
        ...where,
        // Abandoned unpaid bookings are noise; a cancelled session that held
        // money (pre-start cancellation) stays visible with its refund.
        OR: [
          { status: { not: SessionStatus.CANCELLED } },
          {
            payments: {
              some: {
                status: {
                  in: [
                    PaymentStatus.HELD,
                    PaymentStatus.RELEASED,
                    PaymentStatus.REFUNDED,
                  ],
                },
              },
            },
          },
        ],
      },
      include: SESSION_INCLUDE,
      orderBy: { startsAt: 'asc' },
    });
    await this.expireOverdue(sessions);
    const now = Date.now();
    const alive = await Promise.all(
      sessions
        .filter((session) => !this.isExpired(session, now))
        .map((session) => this.progression.normalize(session)),
    );
    const extras = { ...this.responseExtras(), viewer: user };
    return {
      upcoming: alive
        .filter((session) => session.startsAt.getTime() >= now)
        .map((session) => toSessionResponse(session, this.avatarUrlOf, extras)),
      past: alive
        .filter((session) => session.startsAt.getTime() < now)
        .reverse()
        .map((session) => toSessionResponse(session, this.avatarUrlOf, extras)),
    };
  }

  async get(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    if (this.isExpired(session, Date.now())) {
      const expired = await this.expireSession(session.id);
      if (expired) {
        return toSessionResponse(
          { ...session, status: SessionStatus.CANCELLED },
          this.avatarUrlOf,
        );
      }
    }
    const current = await this.progression.normalize(session);
    return toSessionResponse(current, this.avatarUrlOf, {
      ...this.responseExtras(),
      viewer: user,
    });
  }

  async pay(
    playerId: string,
    sessionId: string,
    dto: PaySessionDto,
    locale: string = DEFAULT_LOCALE,
  ): Promise<PaySessionResponse> {
    // The checkout showed the policy; a stale tab must re-render it.
    if (dto.bookingPolicyVersion !== undefined) {
      this.legal.assertCurrent([
        {
          document: LegalDocument.BookingPolicy,
          version: dto.bookingPolicyVersion,
        },
      ]);
    }
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    if (!session || session.playerId !== playerId) {
      throw new NotFoundException();
    }
    if (session.status === SessionStatus.PAID_ESCROW) {
      throw new ConflictException('This session is already paid.');
    }
    if (session.status !== SessionStatus.PENDING_PAYMENT) {
      throw new ConflictException('This session is not payable.');
    }
    if (this.isExpired(session, Date.now())) {
      await this.expireSession(session.id);
      throw new ConflictException(
        'The payment window has expired and the slot was released.',
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        sessionId: session.id,
        provider: PAYMENT_PROVIDER_NAME,
        amountMinor: session.priceMinor,
        currency: session.currency,
        feeMinor: session.platformFeeMinor,
      },
    });
    // The provider call stays outside any DB transaction — a real vendor is a
    // network hop. The state transition below is conditional, so a race with
    // the sweep or a concurrent pay can never double-commit.
    const result = await this.payments.hold({
      sessionId: session.id,
      amountMinor: session.priceMinor,
      currency: session.currency,
      instrument: dto.instrument,
    });
    if (!result.ok) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      return {
        session: toSessionResponse(session, this.avatarUrlOf),
        paymentStatus: SharedPaymentStatus.Failed,
        declineReason: result.reason,
      };
    }

    const transitioned = await this.prisma.$transaction(async (tx) => {
      // Both parties under the row lock a deletion request takes first: a
      // request that committed before is seen, one behind us sees the pay.
      const departing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User"
        WHERE "id" IN (${playerId}, ${session.proProfile.userId})
          AND ("deletionScheduledFor" IS NOT NULL OR "deletedAt" IS NOT NULL)
        FOR NO KEY UPDATE`;
      if (departing.length > 0) {
        return false;
      }
      const updated = await tx.session.updateMany({
        where: { id: session.id, status: SessionStatus.PENDING_PAYMENT },
        data: {
          status: SessionStatus.PAID_ESCROW,
          expiresAt: null,
          // Anchors the late-booking cancellation grace.
          paidAt: new Date(),
          // The room slug is a capability: random enough to be unguessable,
          // minted atomically with the payment so invites can embed the URL.
          roomSlug: isOnlineService(session.serviceType)
            ? randomBytes(16).toString('base64url')
            : null,
          // The invite rows below are the send; the stamp keeps the
          // cancellation rule ("only after an invite") and the reminder
          // window rule ("booked before the window opened").
          inviteSentAt: new Date(),
        },
      });
      if (updated.count === 0) {
        return false;
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.HELD, providerRef: result.providerRef },
      });
      // Receipt + new-booking email, each with its own localized .ics,
      // written with the state change so they can never be lost or doubled.
      await this.notifications.enqueue(tx, [
        {
          kind: NotificationKind.SESSION_PAID_PLAYER,
          sessionId: session.id,
          recipientId: session.playerId,
        },
        {
          kind: NotificationKind.SESSION_PAID_COACH,
          sessionId: session.id,
          recipientId: session.proProfile.userId,
        },
      ]);
      // Paying acknowledges the booking policy the checkout showed.
      await this.legal.record(tx, {
        userId: playerId,
        accepted: [
          {
            document: LegalDocument.BookingPolicy,
            version: currentLegalVersion(LegalDocument.BookingPolicy).version,
          },
        ],
        locale,
        context: LegalAcceptanceContext.Checkout,
        sessionId: session.id,
      });
      return true;
    });
    if (!transitioned) {
      // Lost the race (sweep cancelled, a concurrent pay won or a party is
      // leaving): void the hold.
      await this.payments.refund(result.providerRef);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw new ConflictException('This session is no longer payable.');
    }

    this.analytics.track({
      event: LIFECYCLE_EVENTS.sessionPaid,
      distinctId: playerId,
      properties: {
        sessionId: session.id,
        serviceType: toSharedServiceType(session.serviceType),
        amountMinor: session.priceMinor,
        currency: session.currency,
      },
    });
    const paid = await this.prisma.session.findUniqueOrThrow({
      where: { id: session.id },
      include: SESSION_INCLUDE,
    });
    return {
      session: toSessionResponse(paid, this.avatarUrlOf),
      paymentStatus: SharedPaymentStatus.Held,
      declineReason: null,
    };
  }

  /**
   * Records a party's confirmation of an awaiting_confirmation session.
   * The player's confirmation completes the session and releases escrow —
   * whatever the attendance classification says — and, on a session held by
   * an open system-opened dispute, withdraws that dispute in the coach's
   * favor. The coach's confirmation is dispute evidence only; for an
   * in-person game it is a required answer that unlocks auto-confirm.
   * Confirmation belongs to the two parties — admins never confirm.
   */
  async confirm(
    user: AuthenticatedUser,
    sessionId: string,
    gameAnswer?: SharedCoachGameAnswer,
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    const isPlayer = session.playerId === user.id;
    const isCoach = session.proProfile.userId === user.id;
    if (!isPlayer && !isCoach) {
      throw new NotFoundException();
    }
    const gameCoach = isCoach && !isOnlineService(session.serviceType);
    if (gameCoach && gameAnswer === undefined) {
      throw new BadRequestException(
        'Answer whether the game took place or the player did not come.',
      );
    }
    if (!gameCoach && gameAnswer !== undefined) {
      throw new BadRequestException(
        'Only the coach of an in-person game answers.',
      );
    }
    // Persist the clock-derived status first so a session whose end time
    // just passed is confirmable without waiting for the sweep.
    await this.progression.normalize(session);
    if (isPlayer) {
      const confirmed = await this.prisma.session.updateMany({
        where: { id: session.id, status: SessionStatus.AWAITING_CONFIRMATION },
        data: {
          status: SessionStatus.COMPLETED_PAID,
          playerConfirmedAt: new Date(),
        },
      });
      if (confirmed.count === 1) {
        await this.settlement.settle(session.id);
      } else if (!(await this.confirmSystemDispute(session.id, user.id))) {
        if (!(await this.hasConfirmed(session.id, 'player'))) {
          throw new ConflictException('This session cannot be confirmed.');
        }
        await this.settlement.settle(session.id);
      }
    } else {
      const confirmed = await this.prisma.session.updateMany({
        where: {
          id: session.id,
          status: SessionStatus.AWAITING_CONFIRMATION,
          coachConfirmedAt: null,
        },
        data: {
          coachConfirmedAt: new Date(),
          ...(gameAnswer !== undefined
            ? { coachGameAnswer: toPrismaGameAnswer(gameAnswer) }
            : {}),
        },
      });
      if (
        confirmed.count === 0 &&
        !(await this.hasConfirmed(session.id, 'coach'))
      ) {
        throw new ConflictException('This session cannot be confirmed.');
      }
    }
    return this.sessionResponse(session.id, user);
  }

  /**
   * "Player confirmation always wins": on a session held by an open
   * system-opened dispute the confirmation resolves it as a release. A
   * dispute the player reported themselves is never withdrawn this way.
   */
  private async confirmSystemDispute(
    sessionId: string,
    playerId: string,
  ): Promise<boolean> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { sessionId },
      select: { id: true, sessionId: true, kind: true, status: true },
    });
    if (
      !dispute ||
      dispute.kind === DisputeKind.PLAYER_REPORTED ||
      dispute.status !== DisputeStatus.OPEN
    ) {
      return false;
    }
    await this.resolution.resolve(dispute, DisputeOutcome.RELEASE, {
      type: 'player',
      userId: playerId,
    });
    return true;
  }

  /**
   * Pre-start cancellation by either party: slot back on the market, calendar
   * event revoked, money per the session's cancellation policy (see
   * cancelPaid). Releasing an unpaid booking stays free and silent.
   */
  async cancel(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    if (session.playerId !== user.id && session.proProfile.userId !== user.id) {
      throw new NotFoundException();
    }
    if (session.status === SessionStatus.PENDING_PAYMENT) {
      // An unpaid booking is the player's hold on the slot: only they can
      // release it early, and nothing was charged, so no settlement runs.
      if (session.playerId !== user.id) {
        throw new ConflictException(
          'Only the player can release an unpaid booking.',
        );
      }
      const released = await this.cancelUnpaidSession(session.id);
      if (!released) {
        throw new ConflictException('This booking is no longer unpaid.');
      }
      this.logger.log(`Unpaid session ${session.id} released by player`);
      return this.sessionResponse(session.id, user);
    }
    await this.cancelPaid(
      session,
      user.id === session.playerId ? 'player' : 'coach',
      user.id,
    );
    return this.sessionResponse(session.id, user);
  }

  /**
   * Force majeure (injury, venue closed, platform outage): an admin cancels a
   * paid session before its start with a full refund and a stored reason. It
   * never counts as a late cancellation for either party.
   */
  async cancelByAdmin(
    admin: AuthenticatedUser,
    sessionId: string,
    reason: string,
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    if (!session) {
      throw new NotFoundException();
    }
    await this.cancelPaid(session, 'admin', admin.id, reason.trim());
  }

  /**
   * The one pre-start cancellation of a paid session, whoever asks. The
   * conditional update is the race guard against the progression sweep
   * flipping the session in_progress at the same moment; it also writes the
   * cancellation record — who, when, the tier and the refund — computed from
   * the session's snapshotted policy. A full refund settles right away; a
   * late player cancellation leaves the payment held until the original
   * start time (the waiver window), see SettlementService.
   */
  private async cancelPaid(
    session: SessionWithParties,
    by: CancellationActor,
    actorId: string,
    reason?: string,
  ): Promise<void> {
    const now = new Date();
    const terms = cancellationTerms({
      policy: policyOf(session),
      priceMinor: session.priceMinor,
      feeMinor: session.platformFeeMinor,
      startsAt: session.startsAt,
      paidAt: session.paidAt,
      by,
      now,
      tierFloor: session.cancelTierFloor,
      coachProposalOutstanding: coachProposalOutstanding(session.reschedules),
    });
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        where: {
          id: session.id,
          status: SessionStatus.PAID_ESCROW,
          // Still the time the terms were computed for: a reschedule
          // accepted in between makes this cancellation lose (409) and the
          // client re-reads the new terms.
          startsAt: { equals: session.startsAt, gt: now },
        },
        data: {
          status: SessionStatus.CANCELLED,
          // The CANCEL .ics must outrank the last invite/update.
          calendarSequence: { increment: 1 },
          cancelledAt: now,
          cancelledBy: by.toUpperCase() as CancelledBy,
          cancellationTier: terms.tier,
          cancellationRefundMinor: terms.refundMinor,
          cancellationLate: terms.late,
          cancellationReason: reason ?? null,
        },
      });
      if (updated.count === 0) {
        return false;
      }
      await tx.availabilitySlot.updateMany({
        where: { id: session.slotId, status: SlotStatus.BOOKED },
        data: { status: SlotStatus.OPEN },
      });
      await supersedeOpenProposal(tx, session.id, now);
      const payload = {
        cancelledBy: by,
        tier: terms.tier.toLowerCase(),
        refundMinor: terms.refundMinor,
      };
      const rows: Parameters<NotificationsService['enqueue']>[1] = [
        {
          kind: NotificationKind.SESSION_CANCELLED_PLAYER,
          sessionId: session.id,
          recipientId: session.playerId,
          payload,
        },
        {
          kind: NotificationKind.SESSION_CANCELLED_COACH,
          sessionId: session.id,
          recipientId: session.proProfile.userId,
          payload,
        },
      ];
      if (by === 'coach') {
        for (const adminId of await this.notifications.adminIds(tx)) {
          rows.push({
            kind: NotificationKind.SESSION_CANCELLED_ADMIN,
            sessionId: session.id,
            recipientId: adminId,
            payload,
          });
        }
      }
      await this.notifications.enqueue(tx, rows);
      return true;
    });
    if (!cancelled) {
      throw new ConflictException(
        'Only paid sessions can be cancelled before they start.',
      );
    }
    this.logger.log(
      `Session ${session.id} cancelled by ${by} ${actorId} (${terms.tier}, refund ${terms.refundMinor})`,
    );
    this.analytics.track({
      event: LIFECYCLE_EVENTS.sessionCancelled,
      distinctId: actorId,
      properties: {
        sessionId: session.id,
        serviceType: toSharedServiceType(session.serviceType),
        amountMinor: session.priceMinor,
        currency: session.currency,
        cancelledBy: by,
        tier: terms.tier.toLowerCase(),
        refundMinor: terms.refundMinor,
        late: terms.late,
      },
    });
    if (terms.late) {
      await this.flagUnreliableCoach(session.proProfileId, now);
    }
    await this.settlement.settle(session.id);
    await this.releaseAttachments(session.id);
  }

  /** Late coach cancellations in the rolling window admins look at. */
  static readonly LATE_CANCELLATION_WINDOW_DAYS = 90;

  /**
   * Tells the admins once, at the moment a coach's late cancellations reach
   * the threshold — not again on every later one (the count is in the key).
   */
  private async flagUnreliableCoach(
    proProfileId: string,
    now: Date,
  ): Promise<void> {
    const threshold = this.config.getOrThrow<number>(
      'COACH_LATE_CANCEL_THRESHOLD',
    );
    const count = await this.prisma.session.count({
      where: lateCancellationsWhere(proProfileId, now),
    });
    if (count !== threshold) {
      return;
    }
    const latest = await this.prisma.session.findFirst({
      where: lateCancellationsWhere(proProfileId, now),
      orderBy: { cancelledAt: 'desc' },
      select: { id: true },
    });
    if (!latest) return;
    const admins = await this.notifications.adminIds(this.prisma);
    await this.notifications.enqueue(
      this.prisma,
      admins.map((adminId) => ({
        kind: NotificationKind.COACH_LATE_CANCELLATIONS_ADMIN,
        sessionId: latest.id,
        recipientId: adminId,
        payload: { count },
      })),
    );
  }

  /**
   * Turns a late cancellation into a full refund while the payment has not
   * settled: the coach's "Refund in full", or an admin's override. The
   * session record and the payment row are touched in one transaction — the
   * touch invalidates a settlement that read the row before the waiver (its
   * claim is conditional on the row's version), and finding no held payment
   * means the release already happened: nothing changes, 409.
   */
  async waiveCancellationFee(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    const isCoach = session.proProfile.userId === user.id;
    if (!isCoach && user.role !== Role.Admin) {
      throw new ForbiddenException('Only the coach can waive the late fee.');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const waived = await tx.session.updateMany({
        where: {
          id: session.id,
          status: SessionStatus.CANCELLED,
          cancellationTier: {
            in: [CancellationTier.PARTIAL, CancellationTier.NONE],
          },
          feeWaivedAt: null,
        },
        data: {
          feeWaivedAt: now,
          feeWaivedById: user.id,
          cancellationRefundMinor: session.priceMinor,
        },
      });
      const held = await tx.payment.updateMany({
        where: { sessionId: session.id, status: PaymentStatus.HELD },
        data: { updatedAt: now },
      });
      if (waived.count === 0 || held.count === 0) {
        throw new ConflictException(
          'There is no late fee left to waive on this session.',
        );
      }
      await this.notifications.enqueue(tx, [
        {
          kind: NotificationKind.CANCELLATION_FEE_WAIVED_PLAYER,
          sessionId: session.id,
          recipientId: session.playerId,
        },
        {
          kind: NotificationKind.CANCELLATION_FEE_WAIVED_COACH,
          sessionId: session.id,
          recipientId: session.proProfile.userId,
        },
      ]);
    });
    this.logger.log(
      `Late fee of session ${session.id} waived by ${user.role} ${user.id}`,
    );
    this.analytics.track({
      event: LIFECYCLE_EVENTS.cancellationFeeWaived,
      distinctId: user.id,
      properties: { sessionId: session.id, waivedBy: user.role },
    });
    await this.settlement.settle(session.id);
    return this.sessionResponse(session.id, user);
  }

  private async hasConfirmed(
    sessionId: string,
    party: 'player' | 'coach',
  ): Promise<boolean> {
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { playerConfirmedAt: true, coachConfirmedAt: true },
    });
    return party === 'player'
      ? session.playerConfirmedAt !== null
      : session.coachConfirmedAt !== null;
  }

  /** Current session state mapped for a party-facing response. */
  async sessionResponse(
    sessionId: string,
    viewer?: AuthenticatedUser,
  ): Promise<SessionResponse> {
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    return toSessionResponse(session, this.avatarUrlOf, {
      ...this.responseExtras(),
      viewer,
    });
  }

  /** Cancels an expired pending session and reopens its slot when claimable. */
  async expireSession(sessionId: string): Promise<boolean> {
    const expired = await this.cancelUnpaidSession(sessionId);
    if (expired) this.logger.log(`Expired unpaid session ${sessionId}`);
    return expired;
  }

  /** A cancelled session no longer protects its clips from the retention sweep. */
  private async releaseAttachments(sessionId: string): Promise<void> {
    const rows = await this.prisma.sessionVideo.findMany({
      where: { sessionId },
      select: { videoId: true },
    });
    await this.unattached.recompute(rows.map((row) => row.videoId));
  }

  /**
   * Releases every unpaid booking a user is a party of, as player or as
   * coach (an accepted deletion request).
   */
  async cancelUnpaidOf(userId: string): Promise<void> {
    const pending = await this.prisma.session.findMany({
      where: {
        OR: [{ playerId: userId }, { proProfile: { userId } }],
        status: SessionStatus.PENDING_PAYMENT,
      },
      select: { id: true },
    });
    for (const session of pending) {
      await this.cancelUnpaidSession(session.id);
    }
  }

  /** Cancels a PENDING_PAYMENT session and reopens its slot; false if it was not unpaid. */
  private async cancelUnpaidSession(sessionId: string): Promise<boolean> {
    const cancelled = await this.cancelUnpaidSessionTx(sessionId);
    if (cancelled) await this.releaseAttachments(sessionId);
    return cancelled;
  }

  private async cancelUnpaidSessionTx(sessionId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.session.updateMany({
        where: { id: sessionId, status: SessionStatus.PENDING_PAYMENT },
        data: { status: SessionStatus.CANCELLED, expiresAt: null },
      });
      if (cancelled.count === 0) {
        return false;
      }
      const session = await tx.session.findUniqueOrThrow({
        where: { id: sessionId },
        select: { slotId: true, startsAt: true },
      });
      // A slot in the past is history, not inventory — leave it alone.
      if (session.startsAt.getTime() > Date.now()) {
        await tx.availabilitySlot.updateMany({
          where: { id: session.slotId, status: SlotStatus.BOOKED },
          data: { status: SlotStatus.OPEN },
        });
      }
      return true;
    });
  }

  /** Clips are required for video analysis and forbidden for anything else. */
  private async validateVideoRules(
    playerId: string,
    dto: CreateBookingDto,
  ): Promise<ValidatedClip[]> {
    if (dto.serviceType !== SharedServiceType.VideoAnalysis) {
      if (dto.videos && dto.videos.length > 0) {
        throw new BadRequestException(
          'Only video-analysis bookings carry clips.',
        );
      }
      return [];
    }
    return this.sessionVideos.validate(playerId, dto.videos ?? []);
  }

  private partyFilter(user: AuthenticatedUser): Prisma.SessionWhereInput {
    if (user.role === Role.Professional) {
      return { proProfile: { userId: user.id } };
    }
    return { playerId: user.id };
  }

  private async requireParty(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SessionWithParties> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    const isParty =
      session &&
      (session.playerId === user.id ||
        session.proProfile.userId === user.id ||
        user.role === Role.Admin);
    if (!session || !isParty) {
      throw new NotFoundException();
    }
    return session;
  }

  private isExpired(
    session: { status: SessionStatus; expiresAt: Date | null },
    now: number,
  ): boolean {
    return (
      session.status === SessionStatus.PENDING_PAYMENT &&
      session.expiresAt !== null &&
      session.expiresAt.getTime() <= now
    );
  }

  private async expireOverdue(
    sessions: Array<{
      id: string;
      status: SessionStatus;
      expiresAt: Date | null;
    }>,
  ): Promise<void> {
    const now = Date.now();
    const overdue = sessions.filter((session) => this.isExpired(session, now));
    for (const session of overdue) {
      await this.expireSession(session.id);
    }
  }
}

/** Trims the player's goal; whitespace-only or absent means "no goal". */
export function normalizeGoal(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
