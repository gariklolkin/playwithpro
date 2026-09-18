import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CoachGameAnswer, Role, ServiceType } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ANALYTICS } from '../observability/observability';
import { PAYMENT_PROVIDER } from '../payments/payment-provider';
import { BookingsService } from './bookings.service';
import { LegalService } from '../legal/legal.service';
import { DisputeResolutionService } from './dispute-resolution.service';
import { SessionProgressionService } from './session-progression.service';
import { SessionVideosService } from './session-videos.service';
import { SettlementService } from './settlement.service';
import { UnattachedVideosService } from '../videos/unattached-videos.service';

const HOUR = 3_600_000;

const futureSlot = {
  id: 'slot-1',
  profileId: 'profile-1',
  startsAt: new Date(Date.now() + 24 * HOUR),
  endsAt: new Date(Date.now() + 25 * HOUR),
  status: 'OPEN',
  source: 'RULE',
};

const verifiedProfile = {
  id: 'profile-1',
  userId: 'coach-1',
  status: 'VERIFIED',
  user: { deletionScheduledFor: null, deletedAt: null },
  services: [
    {
      id: 's1',
      type: 'CONSULTATION',
      priceMinor: 4005,
      currency: 'EUR',
      active: true,
    },
  ],
};

const pendingSession = {
  id: 'session-1',
  playerId: 'player-1',
  proProfileId: 'profile-1',
  serviceType: 'CONSULTATION',
  priceMinor: 4005,
  currency: 'EUR',
  platformFeeMinor: 401,
  slotId: 'slot-1',
  status: 'PENDING_PAYMENT',
  startsAt: futureSlot.startsAt,
  endsAt: futureSlot.endsAt,
  expiresAt: new Date(Date.now() + 15 * 60_000),
  playerConfirmedAt: null,
  coachConfirmedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  player: { id: 'player-1', displayName: 'Player', avatarKey: null },
  proProfile: {
    ...verifiedProfile,
    user: { displayName: 'Coach', avatarKey: null },
  },
  paidAt: null,
  cancelFreeHours: 24,
  cancelLateRefundPercent: 50,
  cancelNoRefundHours: 2,
  cancelGraceMin: 30,
  cancelledAt: null,
  cancelledBy: null,
  cancellationTier: null,
  cancellationRefundMinor: null,
  cancellationLate: false,
  cancellationReason: null,
  feeWaivedAt: null,
  feeWaivedById: null,
  rescheduleCount: 0,
  rescheduledAt: null,
  cancelTierFloor: null,
  reschedules: [],
  coachGameAnswer: null,
  attendanceOutcome: null,
  attendancePartial: false,
  classifiedAt: null,
  videos: [],
  payments: [],
  dispute: null,
  attendance: [],
  review: null,
};

describe('BookingsService', () => {
  let service: BookingsService;

  const tx = {
    availabilitySlot: { updateMany: jest.fn() },
    session: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    payment: { update: jest.fn(), updateMany: jest.fn() },
    sessionReschedule: { findFirst: jest.fn(), updateMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const prisma = {
    proProfile: { findUnique: jest.fn() },
    availabilitySlot: { findUnique: jest.fn() },
    sessionVideo: { findMany: jest.fn() },
    session: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    payment: { create: jest.fn(), update: jest.fn() },
    dispute: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const resolution = { resolve: jest.fn() };
  const legal = { assertCurrent: jest.fn(), record: jest.fn() };
  const provider = {
    hold: jest.fn(),
    release: jest.fn(),
    refund: jest.fn(),
  };
  const notifications = {
    enqueue: jest.fn(),
    enqueueDebounced: jest.fn(),
    adminIds: jest.fn().mockResolvedValue(['admin-1']),
  };
  const progression = {
    normalize: jest.fn(<T>(session: T) => Promise.resolve(session)),
  };
  const settlement = { settle: jest.fn() };
  const sessionVideos = {
    validate: jest.fn(),
    rowsFor: jest.fn(
      (clips: { video: { id: string }; note: string | null }[]) =>
        clips.map((clip, position) => ({
          position,
          note: clip.note,
          video: { connect: { id: clip.video.id } },
        })),
    ),
    replace: jest.fn(),
  };
  const unattached = { recompute: jest.fn() };
  const analytics = { track: jest.fn() };
  const config = {
    getOrThrow: (name: string) =>
      ({
        PLATFORM_FEE_PERCENT: 10,
        BOOKING_PAYMENT_TTL_MIN: 15,
        ROOM_JOIN_WINDOW_BEFORE_MIN: 15,
        ROOM_JOIN_WINDOW_AFTER_MIN: 30,
        AUTO_CONFIRM_WINDOW_HOURS: 48,
        CANCELLATION_FREE_HOURS: 24,
        CANCELLATION_LATE_REFUND_PERCENT: 50,
        CANCELLATION_NO_REFUND_HOURS: 2,
        CANCELLATION_GRACE_MIN: 30,
        COACH_LATE_CANCEL_THRESHOLD: 3,
        RESCHEDULE_MAX_PER_SESSION: 2,
        WEB_APP_URL: 'http://localhost:3000',
      })[name],
  };
  const storage = { avatarUrl: jest.fn((key: string) => `https://s/${key}`) };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );
    tx.$queryRaw.mockResolvedValue([]);
    prisma.sessionVideo.findMany.mockResolvedValue([]);
    sessionVideos.validate.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: StorageService, useValue: storage },
        { provide: PAYMENT_PROVIDER, useValue: provider },
        { provide: NotificationsService, useValue: notifications },
        { provide: SessionProgressionService, useValue: progression },
        { provide: SettlementService, useValue: settlement },
        { provide: DisputeResolutionService, useValue: resolution },
        { provide: LegalService, useValue: legal },
        { provide: SessionVideosService, useValue: sessionVideos },
        { provide: UnattachedVideosService, useValue: unattached },
        { provide: ANALYTICS, useValue: analytics },
      ],
    }).compile();
    service = moduleRef.get(BookingsService);
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.proProfile.findUnique.mockResolvedValue(verifiedProfile);
      prisma.availabilitySlot.findUnique.mockResolvedValue(futureSlot);
      tx.availabilitySlot.updateMany.mockResolvedValue({ count: 1 });
      tx.session.create.mockResolvedValue(pendingSession);
    });

    it('claims the slot and snapshots price, fee, and times', async () => {
      await service.create('player-1', {
        proId: 'profile-1',
        serviceType: ServiceType.Consultation,
        slotId: 'slot-1',
      });

      expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith({
        where: { id: 'slot-1', status: 'OPEN' },
        data: { status: 'BOOKED' },
      });
      expect(tx.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priceMinor: 4005,
            platformFeeMinor: 401, // 10% of 4005, rounded half up
            startsAt: futureSlot.startsAt,
          }) as object,
        }),
      );
    });

    it('stores a trimmed goal and treats blank text as no goal', async () => {
      await service.create('player-1', {
        proId: 'profile-1',
        serviceType: ServiceType.Consultation,
        slotId: 'slot-1',
        goal: '  Backhand loop  ',
      });
      expect(tx.session.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ goal: 'Backhand loop' }) as object,
        }),
      );

      await service.create('player-1', {
        proId: 'profile-1',
        serviceType: ServiceType.Consultation,
        slotId: 'slot-1',
        goal: '   ',
      });
      expect(tx.session.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ goal: null }) as object,
        }),
      );
    });

    it('409s when the conditional claim affects no rows', async () => {
      tx.availabilitySlot.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.create('player-1', {
          proId: 'profile-1',
          serviceType: ServiceType.Consultation,
          slotId: 'slot-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.session.create).not.toHaveBeenCalled();
    });

    it('409s on a slot inside the 2-hour notice window', async () => {
      prisma.availabilitySlot.findUnique.mockResolvedValue({
        ...futureSlot,
        startsAt: new Date(Date.now() + HOUR),
      });

      await expect(
        service.create('player-1', {
          proId: 'profile-1',
          serviceType: ServiceType.Consultation,
          slotId: 'slot-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hides unverified coaches behind not-found', async () => {
      prisma.proProfile.findUnique.mockResolvedValue({
        ...verifiedProfile,
        status: 'DRAFT',
      });

      await expect(
        service.create('player-1', {
          proId: 'profile-1',
          serviceType: ServiceType.Consultation,
          slotId: 'slot-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('validates the clip set for video analysis and writes the rows', async () => {
      prisma.proProfile.findUnique.mockResolvedValue({
        ...verifiedProfile,
        services: [
          {
            id: 's2',
            type: 'VIDEO_ANALYSIS',
            priceMinor: 6000,
            currency: 'EUR',
            active: true,
          },
        ],
      });
      sessionVideos.validate.mockResolvedValue([
        { video: { id: 'video-1' }, note: 'serve' },
        { video: { id: 'video-2' }, note: null },
      ]);

      await service.create('player-1', {
        proId: 'profile-1',
        serviceType: ServiceType.VideoAnalysis,
        slotId: 'slot-1',
        videos: [{ videoId: 'video-1', note: 'serve' }, { videoId: 'video-2' }],
      });

      expect(sessionVideos.validate).toHaveBeenCalledWith('player-1', [
        { videoId: 'video-1', note: 'serve' },
        { videoId: 'video-2' },
      ]);
      expect(tx.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            videos: {
              create: [
                {
                  position: 0,
                  note: 'serve',
                  video: { connect: { id: 'video-1' } },
                },
                {
                  position: 1,
                  note: null,
                  video: { connect: { id: 'video-2' } },
                },
              ],
            },
          }) as object,
        }),
      );
      // Attaching stops the retention clock.
      expect(unattached.recompute).toHaveBeenCalledWith(['video-1', 'video-2']);
    });

    it('surfaces the validator rejection for video analysis and books nothing', async () => {
      prisma.proProfile.findUnique.mockResolvedValue({
        ...verifiedProfile,
        services: [
          {
            id: 's2',
            type: 'VIDEO_ANALYSIS',
            priceMinor: 6000,
            currency: 'EUR',
            active: true,
          },
        ],
      });
      sessionVideos.validate.mockRejectedValue(
        new BadRequestException({ reason: 'empty' }),
      );

      await expect(
        service.create('player-1', {
          proId: 'profile-1',
          serviceType: ServiceType.VideoAnalysis,
          slotId: 'slot-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sessionVideos.validate).toHaveBeenCalledWith('player-1', []);
      expect(tx.session.create).not.toHaveBeenCalled();
    });

    it('forbids clips on non-video-analysis bookings', async () => {
      await expect(
        service.create('player-1', {
          proId: 'profile-1',
          serviceType: ServiceType.Consultation,
          slotId: 'slot-1',
          videos: [{ videoId: 'video-1' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sessionVideos.validate).not.toHaveBeenCalled();
    });
  });

  describe('updateVideos', () => {
    it('delegates the replace and returns the fresh session', async () => {
      prisma.session.findUniqueOrThrow.mockResolvedValue(pendingSession);

      const result = await service.updateVideos('player-1', 'session-1', [
        { videoId: 'video-1' },
      ]);

      expect(sessionVideos.replace).toHaveBeenCalledWith(
        'player-1',
        'session-1',
        [{ videoId: 'video-1' }],
      );
      expect(result.id).toBe('session-1');
    });
  });

  describe('pay', () => {
    beforeEach(() => {
      prisma.session.findUnique.mockResolvedValue(pendingSession);
      prisma.payment.create.mockResolvedValue({ id: 'payment-1' });
      tx.session.updateMany.mockResolvedValue({ count: 1 });
      // Default: the invite was already claimed elsewhere; dedicated tests
      // flip this to exercise the dispatch path.
      prisma.session.updateMany.mockResolvedValue({ count: 0 });
      prisma.session.findUniqueOrThrow.mockResolvedValue({
        ...pendingSession,
        status: 'PAID_ESCROW',
        expiresAt: null,
        roomSlug: 'slug-1',
        player: { ...pendingSession.player, email: 'player@example.com' },
        proProfile: {
          ...pendingSession.proProfile,
          user: {
            ...pendingSession.proProfile.user,
            email: 'coach@example.com',
          },
          services: [],
        },
      });
    });

    it('holds funds, transitions to paid_escrow, and mints a room slug', async () => {
      provider.hold.mockResolvedValue({ ok: true, providerRef: 'ref-1' });

      const result = await service.pay('player-1', 'session-1', {});

      expect(provider.hold).toHaveBeenCalledWith({
        sessionId: 'session-1',
        amountMinor: 4005,
        currency: 'EUR',
        instrument: undefined,
      });
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: 'PENDING_PAYMENT' },
        data: {
          status: 'PAID_ESCROW',
          expiresAt: null,
          roomSlug: expect.any(String) as string,
          inviteSentAt: expect.any(Date) as Date,
          paidAt: expect.any(Date) as Date,
        },
      });
      expect(result.paymentStatus).toBe('held');
      expect(result.session.status).toBe('paid_escrow');
      // Receipt + new-booking rows are written inside the pay transaction.
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        {
          kind: 'SESSION_PAID_PLAYER',
          sessionId: 'session-1',
          recipientId: 'player-1',
        },
        {
          kind: 'SESSION_PAID_COACH',
          sessionId: 'session-1',
          recipientId: 'coach-1',
        },
      ]);
      expect(analytics.track).toHaveBeenCalledWith({
        event: 'session_paid',
        distinctId: 'player-1',
        properties: {
          sessionId: 'session-1',
          serviceType: 'consultation',
          amountMinor: 4005,
          currency: 'EUR',
        },
      });
    });

    it('mints no room slug for an in-person game session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...pendingSession,
        serviceType: 'GAME',
      });
      provider.hold.mockResolvedValue({ ok: true, providerRef: 'ref-1' });

      await service.pay('player-1', 'session-1', {});

      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roomSlug: null }) as object,
        }),
      );
    });

    it('records a declined hold and keeps the session payable', async () => {
      provider.hold.mockResolvedValue({ ok: false, reason: 'card_declined' });

      const result = await service.pay('player-1', 'session-1', {
        instrument: 'mock-decline',
      });

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'FAILED' } }),
      );
      expect(result.paymentStatus).toBe('failed');
      expect(result.declineReason).toBe('card_declined');
      expect(tx.session.updateMany).not.toHaveBeenCalled();
    });

    it('409s an already-paid session without a second hold', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...pendingSession,
        status: 'PAID_ESCROW',
        expiresAt: null,
      });

      await expect(
        service.pay('player-1', 'session-1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(provider.hold).not.toHaveBeenCalled();
    });

    it('voids the hold when the transition loses the race', async () => {
      provider.hold.mockResolvedValue({ ok: true, providerRef: 'ref-1' });
      tx.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.pay('player-1', 'session-1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(provider.refund).toHaveBeenCalledWith('ref-1');
    });

    it('voids the hold when a party is leaving the platform', async () => {
      provider.hold.mockResolvedValue({ ok: true, providerRef: 'ref-1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'player-1' }]);

      await expect(
        service.pay('player-1', 'session-1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.session.updateMany).not.toHaveBeenCalled();
      expect(provider.refund).toHaveBeenCalledWith('ref-1');
    });

    it('expires a late payment and releases the slot', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...pendingSession,
        expiresAt: new Date(Date.now() - 60_000),
      });
      tx.session.updateMany.mockResolvedValue({ count: 1 });
      tx.session.findUniqueOrThrow.mockResolvedValue({
        slotId: 'slot-1',
        startsAt: futureSlot.startsAt,
      });

      await expect(
        service.pay('player-1', 'session-1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(provider.hold).not.toHaveBeenCalled();
      expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith({
        where: { id: 'slot-1', status: 'BOOKED' },
        data: { status: 'OPEN' },
      });
    });

    it('404s a non-party payer', async () => {
      await expect(
        service.pay('stranger', 'session-1', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('filters by coach identity for professionals', async () => {
      prisma.session.findMany.mockResolvedValue([]);

      await service.list({ id: 'coach-1', role: Role.Professional });

      expect(prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            proProfile: { userId: 'coach-1' },
            OR: [
              { status: { not: 'CANCELLED' } },
              {
                payments: {
                  some: {
                    status: { in: ['HELD', 'RELEASED', 'REFUNDED'] },
                  },
                },
              },
            ],
          }) as object,
        }),
      );
    });

    it('splits sessions into upcoming and past for players', async () => {
      const past = {
        ...pendingSession,
        id: 'session-past',
        status: 'PAID_ESCROW',
        expiresAt: null,
        startsAt: new Date(Date.now() - 3 * HOUR),
        endsAt: new Date(Date.now() - 2 * HOUR),
      };
      const upcoming = {
        ...pendingSession,
        status: 'PAID_ESCROW',
        expiresAt: null,
      };
      prisma.session.findMany.mockResolvedValue([past, upcoming]);

      const result = await service.list({ id: 'player-1', role: Role.Amateur });

      expect(result.upcoming.map((s) => s.id)).toEqual(['session-1']);
      expect(result.past.map((s) => s.id)).toEqual(['session-past']);
    });
  });

  describe('confirm', () => {
    const awaitingSession = {
      ...pendingSession,
      status: 'AWAITING_CONFIRMATION',
      expiresAt: null,
      startsAt: new Date(Date.now() - 3 * HOUR),
      endsAt: new Date(Date.now() - 2 * HOUR),
      payments: [{ status: 'HELD' }],
    };

    beforeEach(() => {
      prisma.session.findUnique.mockResolvedValue(awaitingSession);
      prisma.dispute.findUnique.mockResolvedValue(null);
      prisma.session.updateMany.mockResolvedValue({ count: 1 });
      prisma.session.findUniqueOrThrow.mockResolvedValue({
        ...awaitingSession,
        status: 'COMPLETED_PAID',
        playerConfirmedAt: new Date(),
        payments: [{ status: 'RELEASED' }],
      });
    });

    it('completes and settles on player confirmation', async () => {
      const result = await service.confirm(
        { id: 'player-1', role: Role.Amateur },
        'session-1',
      );

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: 'AWAITING_CONFIRMATION' },
        data: {
          status: 'COMPLETED_PAID',
          playerConfirmedAt: expect.any(Date) as Date,
        },
      });
      expect(settlement.settle).toHaveBeenCalledWith('session-1');
      expect(result.status).toBe('completed_paid');
      expect(result.escrow).toBe('released');
    });

    it('records coach confirmation as evidence without settling', async () => {
      await service.confirm(
        { id: 'coach-1', role: Role.Professional },
        'session-1',
      );

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-1',
          status: 'AWAITING_CONFIRMATION',
          coachConfirmedAt: null,
        },
        data: { coachConfirmedAt: expect.any(Date) as Date },
      });
      expect(settlement.settle).not.toHaveBeenCalled();
    });

    it('withdraws an open system dispute in the coach favor when the player confirms', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 0 });
      const dispute = {
        id: 'dispute-1',
        sessionId: 'session-1',
        kind: 'COACH_NO_SHOW',
        status: 'OPEN',
      };
      prisma.dispute.findUnique.mockResolvedValue(dispute);

      await service.confirm(
        { id: 'player-1', role: Role.Amateur },
        'session-1',
      );

      expect(resolution.resolve).toHaveBeenCalledWith(dispute, 'RELEASE', {
        type: 'player',
        userId: 'player-1',
      });
    });

    it('never withdraws a dispute the player reported themselves', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 0 });
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'dispute-1',
        sessionId: 'session-1',
        kind: 'PLAYER_REPORTED',
        status: 'OPEN',
      });
      prisma.session.findUniqueOrThrow.mockResolvedValue({
        playerConfirmedAt: null,
        coachConfirmedAt: null,
      });

      await expect(
        service.confirm({ id: 'player-1', role: Role.Amateur }, 'session-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(resolution.resolve).not.toHaveBeenCalled();
    });

    it('requires the game answer from the coach of a game, and only from them', async () => {
      const coach = { id: 'coach-1', role: Role.Professional };
      await expect(
        service.confirm(coach, 'session-1', CoachGameAnswer.TookPlace),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.session.findUnique.mockResolvedValue({
        ...awaitingSession,
        serviceType: 'GAME',
      });
      await expect(service.confirm(coach, 'session-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.confirm(
          { id: 'player-1', role: Role.Amateur },
          'session-1',
          CoachGameAnswer.TookPlace,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await service.confirm(coach, 'session-1', CoachGameAnswer.PlayerAbsent);
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-1',
          status: 'AWAITING_CONFIRMATION',
          coachConfirmedAt: null,
        },
        data: {
          coachConfirmedAt: expect.any(Date) as Date,
          coachGameAnswer: 'PLAYER_ABSENT',
        },
      });
      expect(settlement.settle).not.toHaveBeenCalled();
    });

    it('409s when the session is not awaiting confirmation', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 0 });
      prisma.session.findUniqueOrThrow.mockResolvedValue({
        playerConfirmedAt: null,
        coachConfirmedAt: null,
      });

      await expect(
        service.confirm({ id: 'player-1', role: Role.Amateur }, 'session-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(settlement.settle).not.toHaveBeenCalled();
    });

    it('treats a repeated confirmation as a no-op', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.confirm(
        { id: 'player-1', role: Role.Amateur },
        'session-1',
      );

      expect(result.status).toBe('completed_paid');
    });

    it('yields not-found for a third party', async () => {
      await expect(
        service.confirm({ id: 'stranger', role: Role.Amateur }, 'session-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancel', () => {
    // The fixture slot starts 24 h from module load: by the time a test
    // runs, a fraction of a second has passed — inside the free window for a
    // coach (late), and the player's tests set their own distance.
    const paidUpcoming = {
      ...pendingSession,
      status: 'PAID_ESCROW',
      expiresAt: null,
      inviteSentAt: null,
      paidAt: new Date(Date.now() - 72 * HOUR),
      payments: [{ status: 'HELD' }],
    };
    const startingIn = (hours: number) => ({
      ...paidUpcoming,
      startsAt: new Date(Date.now() + hours * HOUR),
      endsAt: new Date(Date.now() + (hours + 1) * HOUR),
    });

    beforeEach(() => {
      prisma.session.findUnique.mockResolvedValue(paidUpcoming);
      tx.session.updateMany.mockResolvedValue({ count: 1 });
      tx.availabilitySlot.updateMany.mockResolvedValue({ count: 1 });
      tx.sessionReschedule.findFirst.mockResolvedValue(null);
      prisma.session.count.mockResolvedValue(1);
      prisma.session.findUniqueOrThrow.mockResolvedValue({
        ...paidUpcoming,
        status: 'CANCELLED',
        payments: [{ status: 'REFUNDED' }],
      });
    });

    it('cancels, reopens the slot, and refunds before start', async () => {
      const result = await service.cancel(
        { id: 'coach-1', role: Role.Professional },
        'session-1',
      );

      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-1',
          status: 'PAID_ESCROW',
          // Guarded on the start the terms were computed for.
          startsAt: {
            equals: paidUpcoming.startsAt,
            gt: expect.any(Date) as Date,
          },
        },
        data: {
          status: 'CANCELLED',
          calendarSequence: { increment: 1 },
          cancelledAt: expect.any(Date) as Date,
          cancelledBy: 'COACH',
          // A coach cancellation always refunds the player in full…
          cancellationTier: 'FREE',
          cancellationRefundMinor: 4005,
          // …and inside the free-cancellation window it is recorded as late.
          cancellationLate: true,
          cancellationReason: null,
        },
      });
      // Both parties are told who cancelled; a coach cancellation also
      // alerts every admin.
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({
          kind: 'SESSION_CANCELLED_PLAYER',
          recipientId: 'player-1',
          payload: { cancelledBy: 'coach', tier: 'free', refundMinor: 4005 },
        }),
        expect.objectContaining({
          kind: 'SESSION_CANCELLED_COACH',
          recipientId: 'coach-1',
        }),
        expect.objectContaining({
          kind: 'SESSION_CANCELLED_ADMIN',
          recipientId: 'admin-1',
        }),
      ]);
      expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith({
        where: { id: 'slot-1', status: 'BOOKED' },
        data: { status: 'OPEN' },
      });
      expect(settlement.settle).toHaveBeenCalledWith('session-1');
      expect(result.status).toBe('cancelled');
      expect(result.escrow).toBe('refunded');
      expect(analytics.track).toHaveBeenCalledWith({
        event: 'session_cancelled',
        distinctId: 'coach-1',
        properties: expect.objectContaining({
          sessionId: 'session-1',
          cancelledBy: 'coach',
          amountMinor: 4005,
          tier: 'free',
          late: true,
        }) as object,
      });
    });

    it.each([
      [30, 'FREE', 4005],
      [10, 'PARTIAL', 2003],
      [1, 'NONE', 0],
    ])(
      'records the player tier %s h before start as %s (refund %s)',
      async (hours, tier, refundMinor) => {
        prisma.session.findUnique.mockResolvedValue(startingIn(hours));

        await service.cancel(
          { id: 'player-1', role: Role.Amateur },
          'session-1',
        );

        expect(tx.session.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              cancelledBy: 'PLAYER',
              cancellationTier: tier,
              cancellationRefundMinor: refundMinor,
              cancellationLate: false,
            }) as object,
          }),
        );
        // The slot reopens in every tier; settlement decides about the money
        // (now for a full refund, at the original start otherwise).
        expect(tx.availabilitySlot.updateMany).toHaveBeenCalled();
        expect(settlement.settle).toHaveBeenCalledWith('session-1');
        // A player cancellation never alerts the admins.
        const rows = (notifications.enqueue.mock.calls as unknown[][])[0][1];
        expect(rows).toHaveLength(2);
      },
    );

    it('honours the late-booking grace', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...startingIn(5),
        paidAt: new Date(Date.now() - 20 * 60_000),
      });

      await service.cancel({ id: 'player-1', role: Role.Amateur }, 'session-1');

      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancellationTier: 'FREE',
            cancellationRefundMinor: 4005,
          }) as object,
        }),
      );
    });

    it('uses the terms snapshotted on the session, not the current config', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...startingIn(10),
        // Booked when the platform still offered 8 hours of free cancellation.
        cancelFreeHours: 8,
      });

      await service.cancel({ id: 'player-1', role: Role.Amateur }, 'session-1');

      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancellationTier: 'FREE',
          }) as object,
        }),
      );
    });

    it('alerts the admins exactly when a coach reaches the late-cancellation threshold', async () => {
      prisma.session.count.mockResolvedValue(3);
      prisma.session.findFirst.mockResolvedValue({ id: 'session-1' });

      await service.cancel(
        { id: 'coach-1', role: Role.Professional },
        'session-1',
      );

      expect(prisma.session.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          proProfileId: 'profile-1',
          cancelledBy: 'COACH',
          cancellationLate: true,
        }) as object,
      });
      expect(notifications.enqueue).toHaveBeenLastCalledWith(prisma, [
        {
          kind: 'COACH_LATE_CANCELLATIONS_ADMIN',
          sessionId: 'session-1',
          recipientId: 'admin-1',
          payload: { count: 3 },
        },
      ]);
    });

    it('stays quiet below and above the threshold', async () => {
      for (const count of [2, 4]) {
        notifications.enqueue.mockClear();
        prisma.session.count.mockResolvedValue(count);
        await service.cancel(
          { id: 'coach-1', role: Role.Professional },
          'session-1',
        );
        expect(notifications.enqueue).toHaveBeenCalledTimes(1);
      }
    });

    it('closes an open reschedule proposal and gives its held slots back', async () => {
      tx.sessionReschedule.findFirst.mockResolvedValue({
        id: 'proposal-1',
        options: [{ slotId: 'slot-7' }, { slotId: 'slot-8' }],
      });

      await service.cancel({ id: 'player-1', role: Role.Amateur }, 'session-1');

      expect(tx.sessionReschedule.updateMany).toHaveBeenCalledWith({
        where: { id: 'proposal-1', status: 'OPEN' },
        data: { status: 'SUPERSEDED', respondedAt: expect.any(Date) as Date },
      });
      expect(tx.availabilitySlot.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['slot-7', 'slot-8'] },
            status: 'BOOKED',
          }) as object,
          data: { status: 'OPEN' },
        }),
      );
    });

    it('refunds the player in full while the coach asked to move the session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...startingIn(1),
        reschedules: [
          { byCoach: true, status: 'DECLINED', createdAt: new Date() },
        ],
      });

      await service.cancel({ id: 'player-1', role: Role.Amateur }, 'session-1');

      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancellationTier: 'FREE',
            cancellationRefundMinor: 4005,
          }) as object,
        }),
      );
    });

    it('keeps the tier frozen at an accepted reschedule (no loophole)', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...startingIn(100),
        cancelTierFloor: 'PARTIAL',
      });

      await service.cancel({ id: 'player-1', role: Role.Amateur }, 'session-1');

      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancellationTier: 'PARTIAL',
            cancellationRefundMinor: 2003,
          }) as object,
        }),
      );
    });

    it('force majeure: an admin cancels with a reason, in full, never late', async () => {
      prisma.session.findUnique.mockResolvedValue(startingIn(1));

      await service.cancelByAdmin(
        { id: 'admin-1', role: Role.Admin },
        'session-1',
        '  Venue closed  ',
      );

      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancelledBy: 'ADMIN',
            cancellationTier: 'FREE',
            cancellationRefundMinor: 4005,
            cancellationLate: false,
            cancellationReason: 'Venue closed',
          }) as object,
        }),
      );
      expect(settlement.settle).toHaveBeenCalledWith('session-1');
    });

    it('lets the player release an unpaid booking without settlement', async () => {
      prisma.session.findUnique.mockResolvedValue(pendingSession);
      tx.session.findUniqueOrThrow.mockResolvedValue({
        slotId: 'slot-1',
        startsAt: futureSlot.startsAt,
      });
      prisma.session.findUniqueOrThrow.mockResolvedValue({
        ...pendingSession,
        status: 'CANCELLED',
        expiresAt: null,
        payments: [],
      });

      const result = await service.cancel(
        { id: 'player-1', role: Role.Amateur },
        'session-1',
      );

      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: 'PENDING_PAYMENT' },
        data: { status: 'CANCELLED', expiresAt: null },
      });
      expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith({
        where: { id: 'slot-1', status: 'BOOKED' },
        data: { status: 'OPEN' },
      });
      expect(settlement.settle).not.toHaveBeenCalled();
      expect(result.status).toBe('cancelled');
    });

    it('refuses the coach releasing an unpaid booking', async () => {
      prisma.session.findUnique.mockResolvedValue(pendingSession);

      await expect(
        service.cancel({ id: 'coach-1', role: Role.Professional }, 'session-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.session.updateMany).not.toHaveBeenCalled();
    });

    it('409s once the session has started', async () => {
      tx.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancel({ id: 'player-1', role: Role.Amateur }, 'session-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(settlement.settle).not.toHaveBeenCalled();
      expect(tx.availabilitySlot.updateMany).not.toHaveBeenCalled();
    });

    it('yields not-found for a third party', async () => {
      await expect(
        service.cancel({ id: 'stranger', role: Role.Amateur }, 'session-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('waiveCancellationFee', () => {
    const cancelledLate = {
      ...pendingSession,
      status: 'CANCELLED',
      expiresAt: null,
      cancelledAt: new Date(),
      cancelledBy: 'PLAYER',
      cancellationTier: 'PARTIAL',
      cancellationRefundMinor: 2003,
      payments: [{ status: 'HELD' }],
    };

    beforeEach(() => {
      prisma.session.findUnique.mockResolvedValue(cancelledLate);
      prisma.session.findUniqueOrThrow.mockResolvedValue(cancelledLate);
      tx.session.updateMany.mockResolvedValue({ count: 1 });
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
    });

    it('records the waiver, touches the held payment and settles a full refund', async () => {
      await service.waiveCancellationFee(
        { id: 'coach-1', role: Role.Professional },
        'session-1',
      );

      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-1',
          status: 'CANCELLED',
          cancellationTier: { in: ['PARTIAL', 'NONE'] },
          feeWaivedAt: null,
        },
        data: {
          feeWaivedAt: expect.any(Date) as Date,
          feeWaivedById: 'coach-1',
          cancellationRefundMinor: 4005,
        },
      });
      // The touch invalidates a settlement that read the row before us.
      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1', status: 'HELD' },
        data: { updatedAt: expect.any(Date) as Date },
      });
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({
          kind: 'CANCELLATION_FEE_WAIVED_PLAYER',
          recipientId: 'player-1',
        }),
        expect.objectContaining({
          kind: 'CANCELLATION_FEE_WAIVED_COACH',
          recipientId: 'coach-1',
        }),
      ]);
      expect(settlement.settle).toHaveBeenCalledWith('session-1');
    });

    it('409s once the payment has settled — nothing changes', async () => {
      tx.payment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.waiveCancellationFee(
          { id: 'coach-1', role: Role.Professional },
          'session-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.enqueue).not.toHaveBeenCalled();
      expect(settlement.settle).not.toHaveBeenCalled();
    });

    it('409s a second waiver and a free cancellation', async () => {
      tx.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.waiveCancellationFee(
          { id: 'coach-1', role: Role.Professional },
          'session-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets an admin waive, but never the player or a stranger', async () => {
      await service.waiveCancellationFee(
        { id: 'admin-1', role: Role.Admin },
        'session-1',
      );
      expect(settlement.settle).toHaveBeenCalledTimes(1);

      await expect(
        service.waiveCancellationFee(
          { id: 'player-1', role: Role.Amateur },
          'session-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.waiveCancellationFee(
          { id: 'stranger', role: Role.Professional },
          'session-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateGoal', () => {
    const paidUpcoming = {
      ...pendingSession,
      status: 'PAID_ESCROW',
      expiresAt: null,
    };

    beforeEach(() => {
      prisma.session.findUnique.mockResolvedValue(paidUpcoming);
      prisma.session.findUniqueOrThrow.mockResolvedValue({
        ...paidUpcoming,
        goal: 'Serve return',
      });
    });

    it('lets the player set a trimmed goal before start', async () => {
      const result = await service.updateGoal(
        { id: 'player-1', role: Role.Amateur },
        'session-1',
        '  Serve return  ',
      );

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { goal: 'Serve return' },
      });
      expect(result.goal).toBe('Serve return');
    });

    it('clears the goal with null', async () => {
      await service.updateGoal(
        { id: 'player-1', role: Role.Amateur },
        'session-1',
        null,
      );
      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { goal: null },
      });
    });

    it('forbids the coach', async () => {
      await expect(
        service.updateGoal(
          { id: 'coach-1', role: Role.Professional },
          'session-1',
          'x',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it('409s once the session has started', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...paidUpcoming,
        status: 'IN_PROGRESS',
        startsAt: new Date(Date.now() - 60_000),
      });
      await expect(
        service.updateGoal(
          { id: 'player-1', role: Role.Amateur },
          'session-1',
          'x',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
