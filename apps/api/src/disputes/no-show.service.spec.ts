import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DisputeResolutionService } from '../bookings/dispute-resolution.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NoShowService } from './no-show.service';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('NoShowService', () => {
  const tx = {
    session: { updateMany: jest.fn() },
    dispute: { create: jest.fn() },
  };
  const prisma = {
    session: { findMany: jest.fn() },
    dispute: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const settings: Record<string, unknown> = {};
  const config = { getOrThrow: (name: string) => settings[name] };
  const resolution = { resolve: jest.fn() };
  const notifications = {
    enqueue: jest.fn(),
    adminIds: jest.fn().mockResolvedValue(['admin-1']),
  };
  const analytics = { track: jest.fn() };
  const service = new NoShowService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    resolution as unknown as DisputeResolutionService,
    notifications as unknown as NotificationsService,
    analytics,
  );

  const now = new Date('2026-09-20T12:00:00Z');
  const startsAt = new Date('2026-09-20T10:00:00Z');
  const endsAt = new Date('2026-09-20T11:00:00Z');
  const connected = (userId: string, fromMin: number, toMin: number) => ({
    userId,
    joinedAt: new Date(startsAt.getTime() + fromMin * MINUTE),
    connectedAt: new Date(startsAt.getTime() + fromMin * MINUTE),
    leftAt: new Date(startsAt.getTime() + toMin * MINUTE),
  });
  const session = (attendance: unknown[], serviceType = 'CONSULTATION') => ({
    id: 'session-1',
    playerId: 'player-1',
    startsAt,
    endsAt,
    serviceType,
    priceMinor: 4005,
    currency: 'EUR',
    proProfile: { userId: 'coach-1' },
    attendance,
  });

  /** First findMany = sessions to classify, second = unanswered games. */
  const due = (toClassify: unknown[], games: unknown[] = []) => {
    prisma.session.findMany
      .mockResolvedValueOnce(toClassify)
      .mockResolvedValueOnce(games);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(settings, {
      ROOM_JOIN_WINDOW_BEFORE_MIN: 15,
      ROOM_JOIN_WINDOW_AFTER_MIN: 30,
      NO_SHOW_CLASSIFY_BUFFER_MIN: 5,
      NO_SHOW_RESPONSE_WINDOW_HOURS: 48,
      NO_SHOW_AUTO_RESOLVE: 'true',
      GAME_UNANSWERED_DISPUTE_DAYS: 7,
    });
    prisma.$transaction.mockImplementation(
      (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );
    tx.session.updateMany.mockResolvedValue({ count: 1 });
    prisma.dispute.findMany.mockResolvedValue([]);
  });

  it('scans only sessions whose join window (plus the buffer) has closed', async () => {
    due([]);
    await service.sweepOnce(now);

    expect(prisma.session.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          status: 'AWAITING_CONFIRMATION',
          classifiedAt: null,
          serviceType: { not: 'GAME' },
          endsAt: { lte: new Date(now.getTime() - 35 * MINUTE) },
        },
      }),
    );
  });

  it('stores a held outcome and leaves the session on the payout path', async () => {
    due([
      session([connected('player-1', 0, 60), connected('coach-1', 18, 60)]),
    ]);
    await service.sweepOnce(now);

    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: 'AWAITING_CONFIRMATION',
        classifiedAt: null,
      },
      data: {
        attendanceOutcome: 'HELD',
        attendancePartial: true,
        classifiedAt: now,
      },
    });
    expect(tx.dispute.create).not.toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'session_classified',
        properties: expect.objectContaining({
          outcome: 'held',
          partial: true,
        }) as object,
      }),
    );
  });

  it('opens a coach no-show dispute with a response deadline and notifies everyone', async () => {
    due([session([connected('player-1', 0, 30)])]);
    await service.sweepOnce(now);

    expect(tx.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendanceOutcome: 'COACH_NO_SHOW',
          status: 'DISPUTED',
        }) as object,
      }),
    );
    expect(tx.dispute.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        kind: 'COACH_NO_SHOW',
        responseDueAt: new Date(now.getTime() + 48 * HOUR),
      },
    });
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
  });

  it('never sets a deadline on an evidence gap', async () => {
    due([
      session([
        connected('player-1', 0, 30),
        { ...connected('coach-1', 1, 2), connectedAt: null, leftAt: null },
      ]),
    ]);
    await service.sweepOnce(now);

    expect(tx.dispute.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        kind: 'EVIDENCE_GAP',
        responseDueAt: null,
      },
    });
  });

  it('leaves the session alone when the player acted first', async () => {
    tx.session.updateMany.mockResolvedValue({ count: 0 });
    due([session([])]);
    await service.sweepOnce(now);

    expect(tx.dispute.create).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('kill switch: disputes open without a deadline and nothing resolves', async () => {
    settings.NO_SHOW_AUTO_RESOLVE = 'false';
    due([session([])]);
    await service.sweepOnce(now);

    expect(tx.dispute.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        kind: 'NO_ATTENDANCE',
        responseDueAt: null,
      },
    });
    expect(prisma.dispute.findMany).not.toHaveBeenCalled();
    expect(resolution.resolve).not.toHaveBeenCalled();
  });

  it('sends a game with a silent coach to an admin, with no deadline', async () => {
    due([], [session([], 'GAME')]);
    await service.sweepOnce(now);

    expect(prisma.session.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          status: 'AWAITING_CONFIRMATION',
          serviceType: 'GAME',
          coachConfirmedAt: null,
          endsAt: { lte: new Date(now.getTime() - 7 * 24 * HOUR) },
        },
      }),
    );
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: 'AWAITING_CONFIRMATION',
        coachConfirmedAt: null,
      },
      data: { status: 'DISPUTED' },
    });
    expect(tx.dispute.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        kind: 'NO_ATTENDANCE',
        responseDueAt: null,
      },
    });
  });

  it('refunds uncontested no-shows past their deadline through the shared path', async () => {
    due([]);
    const dispute = {
      id: 'dispute-1',
      sessionId: 'session-1',
      kind: 'COACH_NO_SHOW',
      session: { playerId: 'player-1' },
    };
    prisma.dispute.findMany.mockResolvedValue([dispute]);
    await service.sweepOnce(now);

    expect(prisma.dispute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'OPEN',
          kind: { in: ['COACH_NO_SHOW', 'NO_ATTENDANCE'] },
          coachRespondedAt: null,
          responseDueAt: { lte: now },
        },
      }),
    );
    expect(resolution.resolve).toHaveBeenCalledWith(dispute, 'REFUND', {
      type: 'system',
      noteCode: 'NO_COACH_RESPONSE',
    });
    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'dispute_auto_resolved' }),
    );
  });

  it('shrugs off losing the race to an admin or the coach', async () => {
    due([]);
    prisma.dispute.findMany.mockResolvedValue([
      {
        id: 'dispute-1',
        sessionId: 'session-1',
        kind: 'NO_ATTENDANCE',
        session: { playerId: 'player-1' },
      },
    ]);
    resolution.resolve.mockRejectedValue(new ConflictException());

    await expect(service.sweepOnce(now)).resolves.toBeUndefined();
    expect(analytics.track).not.toHaveBeenCalled();
  });
});
