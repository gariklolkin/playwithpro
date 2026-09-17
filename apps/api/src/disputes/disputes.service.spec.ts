import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  DisputeKind as SharedDisputeKind,
  DisputeOutcome as SharedDisputeOutcome,
  DisputeReasonCategory,
  Role,
} from '@playwithpro/shared';
import type { BookingsService } from '../bookings/bookings.service';
import { DisputeResolutionService } from '../bookings/dispute-resolution.service';
import type { SessionProgressionService } from '../bookings/session-progression.service';
import type { SettlementService } from '../bookings/settlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { DisputesService } from './disputes.service';
import type { NotificationsService } from '../notifications/notifications.service';

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
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const bookings = { sessionResponse: jest.fn() };
  const progression = {
    normalize: jest.fn(<T>(session: T) => Promise.resolve(session)),
  };
  const settlement = { settle: jest.fn() };
  const analytics = { track: jest.fn() };
  const notifications = {
    enqueue: jest.fn(),
    adminIds: jest.fn().mockResolvedValue(['admin-1']),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue(30) };
  // The real resolution path over the mocked database: the admin verdict is
  // asserted down to the conditional update it shares with the other actors.
  const resolution = new DisputeResolutionService(
    prisma as unknown as PrismaService,
    settlement as unknown as SettlementService,
  );
  const service = new DisputesService(
    prisma as unknown as PrismaService,
    bookings as unknown as BookingsService,
    progression as unknown as SessionProgressionService,
    resolution,
    config as unknown as ConfigService,
    analytics,
    notifications as unknown as NotificationsService,
  );

  const awaitingSession = {
    id: 'session-1',
    playerId: 'player-1',
    status: 'AWAITING_CONFIRMATION',
    startsAt: new Date(Date.now() - 3 * HOUR),
    endsAt: new Date(Date.now() - 2 * HOUR),
    serviceType: 'CONSULTATION',
    priceMinor: 4005,
    currency: 'EUR',
    proProfile: { userId: 'coach-1' },
  };

  const disputeRow = {
    id: 'dispute-1',
    sessionId: 'session-1',
    status: 'OPEN',
    kind: 'PLAYER_REPORTED',
    reasonCategory: 'COACH_NO_SHOW',
    outcome: null,
    reason: 'Coach never joined',
    adminNote: null,
    responseDueAt: null,
    coachResponse: null,
    coachRespondedAt: null,
    resolvedVia: null,
    systemNoteCode: null,
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
      playerId: 'player-1',
      attendanceOutcome: null,
      attendancePartial: false,
      classifiedAt: null,
      player: { id: 'player-1', displayName: 'Player' },
      proProfile: {
        id: 'profile-1',
        userId: 'coach-1',
        user: { displayName: 'Coach' },
      },
      attendance: [
        {
          userId: 'player-1',
          joinedAt: new Date(),
          connectedAt: null,
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
    prisma.dispute.findMany.mockResolvedValue([]);
    prisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    config.getOrThrow.mockReturnValue(30);
  });

  describe('open', () => {
    it('flips the session to disputed and records the reason', async () => {
      const result = await service.open(
        { id: 'player-1', role: Role.Amateur },
        'session-1',
        DisputeReasonCategory.CoachNoShow,
        '  Coach never joined ',
      );

      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: 'AWAITING_CONFIRMATION' },
        data: { status: 'DISPUTED' },
      });
      expect(tx.dispute.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          kind: 'PLAYER_REPORTED',
          openedById: 'player-1',
          reasonCategory: 'COACH_NO_SHOW',
          reason: 'Coach never joined',
        },
      });
      expect(result.status).toBe('disputed');
      // Player receipt, coach hold notice, one alert per admin — no reason text.
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({
          kind: 'DISPUTE_OPENED_PLAYER',
          recipientId: 'player-1',
        }),
        expect.objectContaining({
          kind: 'DISPUTE_OPENED_COACH',
          recipientId: 'coach-1',
        }),
        expect.objectContaining({
          kind: 'DISPUTE_OPENED_ADMIN',
          recipientId: 'admin-1',
        }),
      ]);
      expect(JSON.stringify(notifications.enqueue.mock.calls)).not.toContain(
        'never joined',
      );
      expect(analytics.track).toHaveBeenCalledWith({
        event: 'session_disputed',
        distinctId: 'player-1',
        properties: {
          sessionId: 'session-1',
          serviceType: 'consultation',
          amountMinor: 4005,
          currency: 'EUR',
        },
      });
    });

    it('stores no text when the category says it all', async () => {
      await service.open(
        { id: 'player-1', role: Role.Amateur },
        'session-1',
        DisputeReasonCategory.TechnicalProblem,
      );
      expect(tx.dispute.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reasonCategory: 'TECHNICAL_PROBLEM',
          reason: null,
        }) as object,
      });
    });

    it('409s when the session is not awaiting confirmation', async () => {
      tx.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.open(
          { id: 'player-1', role: Role.Amateur },
          'session-1',
          DisputeReasonCategory.Other,
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
          DisputeReasonCategory.Other,
          'reason',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('yields not-found for a third party', async () => {
      await expect(
        service.open(
          { id: 'stranger', role: Role.Amateur },
          'session-1',
          DisputeReasonCategory.Other,
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
          resolvedVia: 'ADMIN',
          systemNoteCode: null,
          adminNote: 'Attendance shows the coach joined',
        }) as object,
      });
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: 'DISPUTED' },
        data: { status: 'RESOLVED' },
      });
      expect(settlement.settle).toHaveBeenCalledWith('session-1');
      expect(result.outcome).toBe('release');
      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'dispute_resolved',
          distinctId: 'admin-1',
          properties: expect.objectContaining({
            sessionId: 'session-1',
            outcome: 'release',
          }) as object,
        }),
      );
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

  describe('respond', () => {
    const coach = { id: 'coach-1', role: Role.Professional };
    const systemSession = {
      id: 'session-1',
      playerId: 'player-1',
      proProfile: { userId: 'coach-1' },
      dispute: { id: 'dispute-1', kind: 'COACH_NO_SHOW' },
    };

    it('records the single statement and cancels the automatic refund', async () => {
      prisma.session.findUnique.mockResolvedValue(systemSession);

      await service.respond(coach, 'session-1', '  We met on another app.  ');

      expect(prisma.dispute.updateMany).toHaveBeenCalledWith({
        where: { id: 'dispute-1', status: 'OPEN', coachRespondedAt: null },
        data: {
          coachResponse: 'We met on another app.',
          coachRespondedAt: expect.any(Date) as Date,
          responseDueAt: null,
        },
      });
      expect(settlement.settle).not.toHaveBeenCalled();
      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'dispute_coach_responded' }),
      );
    });

    it('409s a second statement, or one after the resolution', async () => {
      prisma.session.findUnique.mockResolvedValue(systemSession);
      prisma.dispute.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.respond(coach, 'session-1', 'Another statement, too late.'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('409s on a dispute the player reported', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...systemSession,
        dispute: { id: 'dispute-1', kind: 'PLAYER_REPORTED' },
      });

      await expect(
        service.respond(coach, 'session-1', 'This is not a system dispute.'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.dispute.updateMany).not.toHaveBeenCalled();
    });

    it('lets only the coach respond', async () => {
      prisma.session.findUnique.mockResolvedValue(systemSession);

      await expect(
        service.respond(
          { id: 'player-1', role: Role.Amateur },
          'session-1',
          'I am the player, not the coach.',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.respond(
          { id: 'stranger', role: Role.Professional },
          'session-1',
          'I am not part of this session.',
        ),
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

    it('filters by kind and shows the summary, the response and the previous no-shows', async () => {
      const contested = {
        ...disputeRow,
        kind: 'COACH_NO_SHOW',
        reasonCategory: null,
        reason: null,
        coachResponse: 'We met on another app.',
        coachRespondedAt: new Date('2026-09-20T12:00:00Z'),
        session: {
          ...disputeRow.session,
          attendanceOutcome: 'COACH_NO_SHOW',
          classifiedAt: new Date(),
        },
      };
      prisma.dispute.findMany
        .mockResolvedValueOnce([contested])
        // Refunded coach no-shows of the listed coaches: an earlier one and
        // (never counted towards itself) the listed dispute.
        .mockResolvedValueOnce([
          { id: 'dispute-0', session: { proProfileId: 'profile-1' } },
          { id: 'dispute-1', session: { proProfileId: 'profile-1' } },
        ]);

      const result = await service.listForAdmin(SharedDisputeKind.CoachNoShow);

      expect(prisma.dispute.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { kind: 'COACH_NO_SHOW' } }),
      );
      const [item] = result.open;
      expect(item.kind).toBe('coach_no_show');
      expect(item.coachResponse).toBe('We met on another app.');
      expect(item.responseDueAt).toBeNull();
      expect(item.coachPreviousNoShows).toBe(1);
      expect(item.attendanceSummary).toMatchObject({
        outcome: 'coach_no_show',
        coachFirstConnectedAt: null,
      });
    });
  });
});
