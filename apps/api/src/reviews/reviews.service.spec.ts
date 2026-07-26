import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@playwithpro/shared';
import { Prisma } from '@prisma/client';
import type { BookingsService } from '../bookings/bookings.service';
import type { SessionProgressionService } from '../bookings/session-progression.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from './reviews.service';

const HOUR = 3_600_000;

describe('ReviewsService', () => {
  const prisma = {
    session: { findUnique: jest.fn() },
    review: { create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    proProfile: { update: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const bookings = { sessionResponse: jest.fn() };
  const progression = {
    normalize: jest.fn(<T>(session: T) => Promise.resolve(session)),
  };
  const service = new ReviewsService(
    prisma as unknown as PrismaService,
    bookings as unknown as BookingsService,
    progression as unknown as SessionProgressionService,
  );

  const player = { id: 'player-1', role: Role.Amateur };
  const completedSession = {
    id: 'session-1',
    playerId: 'player-1',
    proProfileId: 'profile-1',
    status: 'COMPLETED_PAID',
    startsAt: new Date(Date.now() - 3 * HOUR),
    endsAt: new Date(Date.now() - 2 * HOUR),
    proProfile: { userId: 'coach-1' },
    dispute: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.session.findUnique.mockResolvedValue(completedSession);
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    progression.normalize.mockImplementation(<T>(session: T) =>
      Promise.resolve(session),
    );
    bookings.sessionResponse.mockResolvedValue({
      id: 'session-1',
      review: { rating: 5, text: 'Great', createdAt: 'now' },
    });
  });

  describe('create', () => {
    it('stores the review and increments the aggregate in one transaction', async () => {
      const result = await service.create(player, 'session-1', {
        rating: 5,
        text: 'Great',
      });

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          proProfileId: 'profile-1',
          playerId: 'player-1',
          rating: 5,
          text: 'Great',
        },
      });
      expect(prisma.proProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { ratingSum: { increment: 5 }, ratingCount: { increment: 1 } },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.review?.rating).toBe(5);
    });

    it('stores blank text as null', async () => {
      await service.create(player, 'session-1', { rating: 4, text: '   ' });

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ text: null }) as object,
      });
    });

    it('accepts a resolved session whose dispute released the payout', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...completedSession,
        status: 'RESOLVED',
        dispute: { outcome: 'RELEASE' },
      });

      await service.create(player, 'session-1', { rating: 3 });

      expect(prisma.review.create).toHaveBeenCalled();
    });

    it('409s a resolved session whose dispute refunded the player', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...completedSession,
        status: 'RESOLVED',
        dispute: { outcome: 'REFUND' },
      });

      await expect(
        service.create(player, 'session-1', { rating: 3 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it.each(['PENDING_PAYMENT', 'PAID_ESCROW', 'IN_PROGRESS', 'DISPUTED'])(
      '409s a session in %s',
      async (status) => {
        prisma.session.findUnique.mockResolvedValue({
          ...completedSession,
          status,
        });

        await expect(
          service.create(player, 'session-1', { rating: 5 }),
        ).rejects.toBeInstanceOf(ConflictException);
      },
    );

    it('409s awaiting_confirmation before the auto-confirm deadline', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...completedSession,
        status: 'AWAITING_CONFIRMATION',
      });

      await expect(
        service.create(player, 'session-1', { rating: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reviews a stale session the normalizer auto-completes', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...completedSession,
        status: 'AWAITING_CONFIRMATION',
      });
      progression.normalize.mockImplementation(<T>(session: T) =>
        Promise.resolve({ ...session, status: 'COMPLETED_PAID' }),
      );

      await service.create(player, 'session-1', { rating: 5 });

      expect(prisma.review.create).toHaveBeenCalled();
    });

    it('409s a duplicate review, including a concurrent one', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create(player, 'session-1', { rating: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows non-duplicate transaction failures', async () => {
      prisma.$transaction.mockRejectedValue(new Error('db down'));

      await expect(
        service.create(player, 'session-1', { rating: 5 }),
      ).rejects.toThrow('db down');
    });

    it('forbids the coach from reviewing', async () => {
      await expect(
        service.create(
          { id: 'coach-1', role: Role.Professional },
          'session-1',
          { rating: 5 },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('yields not-found for a third party', async () => {
      await expect(
        service.create({ id: 'stranger', role: Role.Amateur }, 'session-1', {
          rating: 5,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('yields not-found for a missing session', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(
        service.create(player, 'missing', { rating: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listPublic', () => {
    const verifiedProfile = { status: 'VERIFIED' };
    const reviewRow = {
      id: 'review-1',
      rating: 5,
      text: 'Great session',
      createdAt: new Date('2026-07-20T10:00:00Z'),
      player: { displayName: 'Luca' },
      session: {
        serviceType: 'CONSULTATION',
        startsAt: new Date('2026-07-19T09:00:00Z'),
      },
    };

    beforeEach(() => {
      prisma.proProfile.findUnique.mockResolvedValue(verifiedProfile);
      prisma.review.count.mockResolvedValue(11);
      prisma.review.findMany.mockResolvedValue([reviewRow]);
    });

    it('lists a verified coach reviews newest first with pagination', async () => {
      const result = await service.listPublic('profile-1', 2);

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { proProfileId: 'profile-1' },
          orderBy: { createdAt: 'desc' },
          skip: 10,
          take: 10,
        }),
      );
      expect(result.total).toBe(11);
      expect(result.page).toBe(2);
      expect(result.items[0]).toEqual({
        id: 'review-1',
        rating: 5,
        text: 'Great session',
        playerDisplayName: 'Luca',
        serviceType: 'consultation',
        sessionDate: '2026-07-19T09:00:00.000Z',
        createdAt: '2026-07-20T10:00:00.000Z',
      });
    });

    it('404s an unverified profile', async () => {
      prisma.proProfile.findUnique.mockResolvedValue({ status: 'DRAFT' });

      await expect(service.listPublic('profile-1', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s a missing profile', async () => {
      prisma.proProfile.findUnique.mockResolvedValue(null);

      await expect(service.listPublic('missing', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
