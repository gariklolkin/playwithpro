import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DisputeOutcome as SharedDisputeOutcome,
  Role,
} from '@playwithpro/shared';
import type { BookingsService } from '../bookings/bookings.service';
import type { SessionProgressionService } from '../bookings/session-progression.service';
import type { SettlementService } from '../bookings/settlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { DisputesService } from './disputes.service';

const HOUR = 3_600_000;

describe('DisputesService', () => {
  const tx = {
    session: { updateMany: jest.fn() },
    dispute: { create: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = {
    session: { findUnique: jest.fn() },
    dispute: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const bookings = { sessionResponse: jest.fn() };
  const progression = {
    normalize: jest.fn(<T>(session: T) => Promise.resolve(session)),
  };
  const settlement = { settle: jest.fn() };
  const service = new DisputesService(
    prisma as unknown as PrismaService,
    bookings as unknown as BookingsService,
    progression as unknown as SessionProgressionService,
    settlement as unknown as SettlementService,
  );

  const awaitingSession = {
    id: 'session-1',
    playerId: 'player-1',
    status: 'AWAITING_CONFIRMATION',
    startsAt: new Date(Date.now() - 3 * HOUR),
    endsAt: new Date(Date.now() - 2 * HOUR),
    proProfile: { userId: 'coach-1' },
  };

  const disputeRow = {
    id: 'dispute-1',
    sessionId: 'session-1',
    status: 'OPEN',
    outcome: null,
    reason: 'Coach never joined',
    adminNote: null,
    createdAt: new Date(),
    resolvedAt: null,
    session: {
      id: 'session-1',
      serviceType: 'CONSULTATION',
      startsAt: awaitingSession.startsAt,
      endsAt: awaitingSession.endsAt,
      priceMinor: 4005,
      currency: 'EUR',
      platformFeeMinor: 401,
      player: { id: 'player-1', displayName: 'Player' },
      proProfile: { id: 'profile-1', user: { displayName: 'Coach' } },
      attendance: [
        {
          userId: 'player-1',
          joinedAt: new Date(),
          leftAt: null,
          user: { displayName: 'Player' },
        },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );
    prisma.session.findUnique.mockResolvedValue(awaitingSession);
    tx.session.updateMany.mockResolvedValue({ count: 1 });
    tx.dispute.updateMany.mockResolvedValue({ count: 1 });
    bookings.sessionResponse.mockResolvedValue({ status: 'disputed' });
    prisma.dispute.findUniqueOrThrow.mockResolvedValue(disputeRow);
  });

  describe('open', () => {
    it('flips the session to disputed and records the reason', async () => {
      const result = await service.open(
        { id: 'player-1', role: Role.Amateur },
        'session-1',
        'Coach never joined',
      );

      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: 'AWAITING_CONFIRMATION' },
        data: { status: 'DISPUTED' },
      });
      expect(tx.dispute.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          openedById: 'player-1',
          reason: 'Coach never joined',
        },
      });
      expect(result.status).toBe('disputed');
    });

    it('409s when the session is not awaiting confirmation', async () => {
      tx.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.open(
          { id: 'player-1', role: Role.Amateur },
          'session-1',
          'reason',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.dispute.create).not.toHaveBeenCalled();
    });

    it('forbids the coach from opening a dispute', async () => {
      await expect(
        service.open(
          { id: 'coach-1', role: Role.Professional },
          'session-1',
          'reason',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('yields not-found for a third party', async () => {
      await expect(
        service.open(
          { id: 'stranger', role: Role.Amateur },
          'session-1',
          'reason',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resolve', () => {
    beforeEach(() => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'dispute-1',
        sessionId: 'session-1',
      });
    });

    it('resolves with a release and settles the payout', async () => {
      prisma.dispute.findUniqueOrThrow.mockResolvedValue({
        ...disputeRow,
        status: 'RESOLVED',
        outcome: 'RELEASE',
        resolvedAt: new Date(),
      });

      const result = await service.resolve(
        'admin-1',
        'dispute-1',
        SharedDisputeOutcome.Release,
        'Attendance shows the coach joined',
      );

      expect(tx.dispute.updateMany).toHaveBeenCalledWith({
        where: { id: 'dispute-1', status: 'OPEN' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          outcome: 'RELEASE',
          resolvedById: 'admin-1',
          adminNote: 'Attendance shows the coach joined',
        }) as object,
      });
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: 'DISPUTED' },
        data: { status: 'RESOLVED' },
      });
      expect(settlement.settle).toHaveBeenCalledWith('session-1');
      expect(result.outcome).toBe('release');
    });

    it('maps a refund outcome to the refund settlement', async () => {
      await service.resolve(
        'admin-1',
        'dispute-1',
        SharedDisputeOutcome.Refund,
      );

      expect(tx.dispute.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: 'REFUND' }) as object,
        }),
      );
      expect(settlement.settle).toHaveBeenCalledWith('session-1');
    });

    it('409s a second resolution without moving money again', async () => {
      tx.dispute.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.resolve('admin-1', 'dispute-1', SharedDisputeOutcome.Refund),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(settlement.settle).not.toHaveBeenCalled();
    });

    it('404s an unknown dispute', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      await expect(
        service.resolve('admin-1', 'missing', SharedDisputeOutcome.Refund),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listForAdmin', () => {
    it('splits disputes into open (oldest first) and resolved (newest first)', async () => {
      const resolvedOld = {
        ...disputeRow,
        id: 'dispute-2',
        status: 'RESOLVED',
        outcome: 'REFUND',
        createdAt: new Date(Date.now() - 2 * HOUR),
        resolvedAt: new Date(),
      };
      const resolvedNew = {
        ...resolvedOld,
        id: 'dispute-3',
        createdAt: new Date(Date.now() - HOUR),
      };
      prisma.dispute.findMany.mockResolvedValue([
        resolvedOld,
        resolvedNew,
        disputeRow,
      ]);

      const result = await service.listForAdmin();

      expect(result.open.map((d) => d.id)).toEqual(['dispute-1']);
      expect(result.resolved.map((d) => d.id)).toEqual([
        'dispute-3',
        'dispute-2',
      ]);
      expect(result.open[0].attendance).toHaveLength(1);
      expect(result.open[0].player.displayName).toBe('Player');
    });
  });
});
