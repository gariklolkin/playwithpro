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
  PaySessionResponse,
  PaymentStatus as SharedPaymentStatus,
  Role,
  SessionListResponse,
  SessionResponse,
  ServiceType as SharedServiceType,
} from '@playwithpro/shared';
import {
  PaymentStatus,
  Prisma,
  ProProfileStatus,
  SessionStatus,
  NotificationKind,
  SlotStatus,
} from '@prisma/client';
import { MIN_NOTICE_MS } from '../availability/availability.service';
import type { AuthenticatedUser } from '../auth/auth-cookies';
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

const MINUTE = 60_000;
const PAYMENT_PROVIDER_NAME = 'mock';

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
    private readonly sessionVideos: SessionVideosService,
    private readonly unattached: UnattachedVideosService,
    @Inject(ANALYTICS) private readonly analytics: Analytics,
    private readonly notifications: NotificationsService,
  ) {}

  private readonly avatarUrlOf = (key: string): string =>
    this.storage.avatarUrl(key);

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
    };
  }

  async create(
    playerId: string,
    dto: CreateBookingDto,
  ): Promise<SessionResponse> {
    const serviceType = toPrismaServiceType(dto.serviceType);
    const profile = await this.prisma.proProfile.findUnique({
      where: { id: dto.proId },
      include: { services: { where: { type: serviceType } } },
    });
    if (!profile || profile.status !== ProProfileStatus.VERIFIED) {
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
  ): Promise<PaySessionResponse> {
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
      const updated = await tx.session.updateMany({
        where: { id: session.id, status: SessionStatus.PENDING_PAYMENT },
        data: {
          status: SessionStatus.PAID_ESCROW,
          expiresAt: null,
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
      return true;
    });
    if (!transitioned) {
      // Lost the race (sweep cancelled or a concurrent pay won): void the hold.
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
   * The player's confirmation completes the session and releases escrow;
   * the coach's is dispute evidence only. Confirmation belongs to the two
   * parties — admins read sessions but never confirm them.
   */
  async confirm(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    const isPlayer = session.playerId === user.id;
    const isCoach = session.proProfile.userId === user.id;
    if (!isPlayer && !isCoach) {
      throw new NotFoundException();
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
      if (
        confirmed.count === 0 &&
        !(await this.hasConfirmed(session.id, 'player'))
      ) {
        throw new ConflictException('This session cannot be confirmed.');
      }
      await this.settlement.settle(session.id);
    } else {
      const confirmed = await this.prisma.session.updateMany({
        where: {
          id: session.id,
          status: SessionStatus.AWAITING_CONFIRMATION,
          coachConfirmedAt: null,
        },
        data: { coachConfirmedAt: new Date() },
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
   * Pre-start cancellation of a paid session by either party: full refund,
   * slot back on the market, calendar event revoked. The conditional update
   * is the race guard against the progression sweep flipping the session
   * in_progress at the same moment.
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
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        where: {
          id: session.id,
          status: SessionStatus.PAID_ESCROW,
          startsAt: { gt: new Date() },
        },
        data: {
          status: SessionStatus.CANCELLED,
          // The CANCEL .ics must outrank the last invite/update.
          calendarSequence: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        return false;
      }
      await tx.availabilitySlot.updateMany({
        where: { id: session.slotId, status: SlotStatus.BOOKED },
        data: { status: SlotStatus.OPEN },
      });
      const cancelledBy = user.id === session.playerId ? 'player' : 'coach';
      const rows: Parameters<NotificationsService['enqueue']>[1] = [
        {
          kind: NotificationKind.SESSION_CANCELLED_PLAYER,
          sessionId: session.id,
          recipientId: session.playerId,
          payload: { cancelledBy },
        },
        {
          kind: NotificationKind.SESSION_CANCELLED_COACH,
          sessionId: session.id,
          recipientId: session.proProfile.userId,
          payload: { cancelledBy },
        },
      ];
      if (cancelledBy === 'coach') {
        for (const adminId of await this.notifications.adminIds(tx)) {
          rows.push({
            kind: NotificationKind.SESSION_CANCELLED_ADMIN,
            sessionId: session.id,
            recipientId: adminId,
            payload: { cancelledBy },
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
    this.logger.log(`Session ${session.id} cancelled by user ${user.id}`);
    this.analytics.track({
      event: LIFECYCLE_EVENTS.sessionCancelled,
      distinctId: user.id,
      properties: {
        sessionId: session.id,
        serviceType: toSharedServiceType(session.serviceType),
        amountMinor: session.priceMinor,
        currency: session.currency,
        cancelledBy: user.role,
      },
    });
    await this.settlement.settle(session.id);
    await this.releaseAttachments(session.id);
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
