import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Role, ServiceType } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CALENDAR_PROVIDER } from '../calendar/calendar-provider';
import { PAYMENT_PROVIDER } from '../payments/payment-provider';
import { BookingsService } from './bookings.service';
import { SessionProgressionService } from './session-progression.service';

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
  videoId: null,
  status: 'PENDING_PAYMENT',
  startsAt: futureSlot.startsAt,
  endsAt: futureSlot.endsAt,
  expiresAt: new Date(Date.now() + 15 * 60_000),
  createdAt: new Date(),
  updatedAt: new Date(),
  player: { id: 'player-1', displayName: 'Player', avatarKey: null },
  proProfile: {
    ...verifiedProfile,
    user: { displayName: 'Coach', avatarKey: null },
  },
  video: null,
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
    payment: { update: jest.fn() },
  };
  const prisma = {
    proProfile: { findUnique: jest.fn() },
    availabilitySlot: { findUnique: jest.fn() },
    video: { findUnique: jest.fn() },
    session: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    payment: { create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  const provider = {
    hold: jest.fn(),
    release: jest.fn(),
    refund: jest.fn(),
  };
  const calendar = {
    sendInvite: jest.fn(),
    sendCancellation: jest.fn(),
  };
  const progression = {
    normalize: jest.fn(<T>(session: T) => Promise.resolve(session)),
  };
  const config = {
    getOrThrow: (name: string) =>
      ({
        PLATFORM_FEE_PERCENT: 10,
        BOOKING_PAYMENT_TTL_MIN: 15,
        ROOM_JOIN_WINDOW_BEFORE_MIN: 15,
        ROOM_JOIN_WINDOW_AFTER_MIN: 30,
        WEB_APP_URL: 'http://localhost:3000',
      })[name],
  };
  const storage = { objectUrl: jest.fn((key: string) => `https://s/${key}`) };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: StorageService, useValue: storage },
        { provide: PAYMENT_PROVIDER, useValue: provider },
        { provide: CALENDAR_PROVIDER, useValue: calendar },
        { provide: SessionProgressionService, useValue: progression },
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

    it('requires a ready own video for video analysis', async () => {
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

      await expect(
        service.create('player-1', {
          proId: 'profile-1',
          serviceType: ServiceType.VideoAnalysis,
          slotId: 'slot-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        ownerId: 'someone-else',
        status: 'READY',
      });
      await expect(
        service.create('player-1', {
          proId: 'profile-1',
          serviceType: ServiceType.VideoAnalysis,
          slotId: 'slot-1',
          videoId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        ownerId: 'player-1',
        status: 'PROCESSING',
      });
      await expect(
        service.create('player-1', {
          proId: 'profile-1',
          serviceType: ServiceType.VideoAnalysis,
          slotId: 'slot-1',
          videoId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forbids a video on non-video-analysis bookings', async () => {
      await expect(
        service.create('player-1', {
          proId: 'profile-1',
          serviceType: ServiceType.Consultation,
          slotId: 'slot-1',
          videoId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
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
        },
      });
      expect(result.paymentStatus).toBe('held');
      expect(result.session.status).toBe('paid_escrow');
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

    it('sends the invite exactly when it claims the idempotency flag', async () => {
      provider.hold.mockResolvedValue({ ok: true, providerRef: 'ref-1' });
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await service.pay('player-1', 'session-1', {});

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-1',
          status: 'PAID_ESCROW',
          inviteSentAt: null,
        },
        data: { inviteSentAt: expect.any(Date) as Date },
      });
      expect(calendar.sendInvite).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          roomUrl: 'http://localhost:3000/sessions/session-1/room',
          venue: null,
          attendees: [
            expect.objectContaining({ email: 'player@example.com' }) as object,
            expect.objectContaining({ email: 'coach@example.com' }) as object,
          ],
        }),
      );
    });

    it('skips the invite when another pay already claimed it', async () => {
      provider.hold.mockResolvedValue({ ok: true, providerRef: 'ref-1' });

      await service.pay('player-1', 'session-1', {});

      expect(calendar.sendInvite).not.toHaveBeenCalled();
    });

    it('keeps the session paid when the invite send fails', async () => {
      provider.hold.mockResolvedValue({ ok: true, providerRef: 'ref-1' });
      prisma.session.updateMany.mockResolvedValue({ count: 1 });
      calendar.sendInvite.mockRejectedValue(new Error('smtp down'));

      const result = await service.pay('player-1', 'session-1', {});

      expect(result.paymentStatus).toBe('held');
      expect(result.session.status).toBe('paid_escrow');
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

  describe('sendCancellationIfInvited', () => {
    it('revokes the event for a cancelled session with a delivered invite', async () => {
      prisma.session.findUnique.mockResolvedValue({
        status: 'CANCELLED',
        inviteSentAt: new Date(),
      });
      prisma.session.findUniqueOrThrow.mockResolvedValue({
        ...pendingSession,
        status: 'CANCELLED',
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

      await service.sendCancellationIfInvited('session-1');

      expect(calendar.sendCancellation).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' }),
      );
    });

    it('sends nothing when no invite ever went out', async () => {
      prisma.session.findUnique.mockResolvedValue({
        status: 'CANCELLED',
        inviteSentAt: null,
      });

      await service.sendCancellationIfInvited('session-1');

      expect(calendar.sendCancellation).not.toHaveBeenCalled();
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
            status: { not: 'CANCELLED' },
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
});
