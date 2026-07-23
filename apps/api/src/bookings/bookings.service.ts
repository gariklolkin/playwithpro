import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
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
  SlotStatus,
  VideoStatus,
} from '@prisma/client';
import { MIN_NOTICE_MS } from '../availability/availability.service';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import type {
  CalendarProvider,
  CalendarSessionInput,
} from '../calendar/calendar-provider';
import { CALENDAR_PROVIDER } from '../calendar/calendar-provider';
import type { PaymentProvider } from '../payments/payment-provider';
import {
  PAYMENT_PROVIDER,
  computePlatformFee,
} from '../payments/payment-provider';
import { toPrismaServiceType } from '../pros/pro-profile.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaySessionDto } from './dto/pay-session.dto';
import { isOnlineService } from './session-access';
import { SessionProgressionService } from './session-progression.service';
import {
  RoomWindow,
  SESSION_INCLUDE,
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
    @Inject(CALENDAR_PROVIDER) private readonly calendar: CalendarProvider,
    private readonly progression: SessionProgressionService,
  ) {}

  private readonly avatarUrlOf = (key: string): string =>
    this.storage.objectUrl(key);

  private roomWindow(): RoomWindow {
    return {
      beforeMin: this.config.getOrThrow<number>('ROOM_JOIN_WINDOW_BEFORE_MIN'),
      afterMin: this.config.getOrThrow<number>('ROOM_JOIN_WINDOW_AFTER_MIN'),
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
    await this.validateVideoRules(playerId, dto);

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
          videoId: dto.videoId ?? null,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          expiresAt: new Date(Date.now() + ttlMinutes * MINUTE),
        },
        include: SESSION_INCLUDE,
      });
    });
    return toSessionResponse(session, this.avatarUrlOf);
  }

  async list(user: AuthenticatedUser): Promise<SessionListResponse> {
    const where = this.partyFilter(user);
    const sessions = await this.prisma.session.findMany({
      where: { ...where, status: { not: SessionStatus.CANCELLED } },
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
    const window = this.roomWindow();
    return {
      upcoming: alive
        .filter((session) => session.startsAt.getTime() >= now)
        .map((session) => toSessionResponse(session, this.avatarUrlOf, window)),
      past: alive
        .filter((session) => session.startsAt.getTime() < now)
        .reverse()
        .map((session) => toSessionResponse(session, this.avatarUrlOf, window)),
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
    return toSessionResponse(current, this.avatarUrlOf, this.roomWindow());
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
        },
      });
      if (updated.count === 0) {
        return false;
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.HELD, providerRef: result.providerRef },
      });
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

    await this.sendInviteOnce(session.id);

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
   * Idempotent post-payment invite: the conditional update is the claim, so
   * concurrent or repeated pay processing emails both parties exactly once.
   * Money state beats notification state — a failed send is logged, never
   * surfaced to the payer.
   */
  private async sendInviteOnce(sessionId: string): Promise<void> {
    const claimed = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        status: SessionStatus.PAID_ESCROW,
        inviteSentAt: null,
      },
      data: { inviteSentAt: new Date() },
    });
    if (claimed.count === 0) {
      return;
    }
    try {
      await this.calendar.sendInvite(await this.calendarInput(sessionId));
    } catch (error) {
      this.logger.error(
        `Failed to send calendar invite for session ${sessionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async calendarInput(
    sessionId: string,
  ): Promise<CalendarSessionInput> {
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        player: { select: { email: true, displayName: true } },
        proProfile: {
          select: {
            user: { select: { email: true, displayName: true } },
            services: {
              where: { type: 'GAME' },
              select: { venueLabel: true },
            },
          },
        },
      },
    });
    const online = isOnlineService(session.serviceType);
    const webAppUrl = this.config.getOrThrow<string>('WEB_APP_URL');
    return {
      sessionId: session.id,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      serviceLabel: session.serviceType.toLowerCase().replace('_', ' '),
      roomUrl: online ? `${webAppUrl}/sessions/${session.id}/room` : null,
      venue: online
        ? null
        : (session.proProfile.services[0]?.venueLabel ?? null),
      attendees: [
        {
          email: session.player.email,
          displayName: session.player.displayName,
        },
        {
          email: session.proProfile.user.email,
          displayName: session.proProfile.user.displayName,
        },
      ],
    };
  }

  /**
   * Calendar cleanup for sessions cancelled after their invite went out.
   * No current flow cancels a paid session; change 9 (refund/dispute) calls
   * this when it introduces one. Unpaid expiry never triggers it because the
   * invite is only sent on payment.
   */
  async sendCancellationIfInvited(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true, inviteSentAt: true },
    });
    if (
      !session ||
      session.status !== SessionStatus.CANCELLED ||
      session.inviteSentAt === null
    ) {
      return;
    }
    try {
      await this.calendar.sendCancellation(await this.calendarInput(sessionId));
    } catch (error) {
      this.logger.error(
        `Failed to send calendar cancellation for session ${sessionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Cancels an expired pending session and reopens its slot when claimable. */
  async expireSession(sessionId: string): Promise<boolean> {
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
      this.logger.log(`Expired unpaid session ${sessionId}`);
      return true;
    });
  }

  private async validateVideoRules(
    playerId: string,
    dto: CreateBookingDto,
  ): Promise<void> {
    if (dto.serviceType !== SharedServiceType.VideoAnalysis) {
      if (dto.videoId) {
        throw new BadRequestException(
          'Only video-analysis bookings carry a video.',
        );
      }
      return;
    }
    if (!dto.videoId) {
      throw new BadRequestException(
        'A video-analysis booking requires a video.',
      );
    }
    const video = await this.prisma.video.findUnique({
      where: { id: dto.videoId },
    });
    if (!video || video.ownerId !== playerId) {
      throw new NotFoundException();
    }
    if (video.status !== VideoStatus.READY) {
      throw new BadRequestException('The video is not ready yet.');
    }
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
