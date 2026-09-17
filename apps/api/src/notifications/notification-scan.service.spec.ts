import type { PrismaService } from '../prisma/prisma.service';
import { NotificationScanService } from './notification-scan.service';
import type { NotificationsService } from './notifications.service';

const HOUR = 3_600_000;

describe('NotificationScanService', () => {
  const prisma = { session: { findMany: jest.fn() } };
  const notifications = { enqueue: jest.fn() };
  const service = new NotificationScanService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  const now = new Date('2026-09-16T10:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.session.findMany.mockResolvedValue([]);
  });

  it('queues 24h reminders for both parties, but records a skip for a late booking', async () => {
    prisma.session.findMany
      .mockResolvedValueOnce([
        {
          id: 's1',
          startsAt: new Date(now.getTime() + 20 * HOUR),
          inviteSentAt: new Date(now.getTime() - 30 * HOUR),
          rescheduledAt: null,
          calendarSequence: 0,
          notifications: [],
          playerId: 'p1',
          proProfile: { userId: 'c1' },
        },
        {
          id: 's2',
          startsAt: new Date(now.getTime() + 5 * HOUR),
          inviteSentAt: new Date(now.getTime() - HOUR),
          rescheduledAt: null,
          calendarSequence: 0,
          notifications: [],
          playerId: 'p2',
          proProfile: { userId: 'c1' },
        },
      ])
      .mockResolvedValue([]);

    await service.scanOnce(now);

    expect(notifications.enqueue).toHaveBeenCalledWith(prisma, [
      expect.objectContaining({
        kind: 'SESSION_REMINDER_24H',
        sessionId: 's1',
        recipientId: 'p1',
      }),
      expect.objectContaining({
        kind: 'SESSION_REMINDER_24H',
        sessionId: 's1',
        recipientId: 'c1',
      }),
    ]);
    expect(notifications.enqueue).toHaveBeenCalledWith(prisma, [
      expect.objectContaining({
        kind: 'SESSION_REMINDER_24H',
        sessionId: 's2',
        payload: { skip: 'booked-inside-window', hours: 24 },
      }),
    ]);
  });

  it('re-arms the reminder for a moved session, once, under its own key', async () => {
    const moved = {
      id: 's4',
      startsAt: new Date(now.getTime() + 20 * HOUR),
      inviteSentAt: new Date(now.getTime() - 200 * HOUR),
      // Moved two days ago; the old time's reminder had gone out before that.
      rescheduledAt: new Date(now.getTime() - 48 * HOUR),
      calendarSequence: 1,
      notifications: [{ createdAt: new Date(now.getTime() - 72 * HOUR) }],
      playerId: 'p1',
      proProfile: { userId: 'c1' },
    };
    prisma.session.findMany
      .mockResolvedValueOnce([moved])
      .mockResolvedValue([]);

    await service.scanOnce(now);

    expect(notifications.enqueue).toHaveBeenCalledWith(prisma, [
      expect.objectContaining({
        kind: 'SESSION_REMINDER_24H',
        sessionId: 's4',
        recipientId: 'p1',
        dedupeSuffix: 'seq1',
      }),
      expect.objectContaining({ recipientId: 'c1', dedupeSuffix: 'seq1' }),
    ]);

    // Next tick: the row written after the move means "already decided".
    notifications.enqueue.mockClear();
    prisma.session.findMany
      .mockResolvedValueOnce([
        { ...moved, notifications: [{ createdAt: new Date(now.getTime()) }] },
      ])
      .mockResolvedValue([]);
    await service.scanOnce(now);
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('sends no reminder for a session moved inside the window', async () => {
    prisma.session.findMany
      .mockResolvedValueOnce([
        {
          id: 's5',
          startsAt: new Date(now.getTime() + 5 * HOUR),
          inviteSentAt: new Date(now.getTime() - 200 * HOUR),
          rescheduledAt: new Date(now.getTime() - HOUR),
          calendarSequence: 2,
          notifications: [],
          playerId: 'p1',
          proProfile: { userId: 'c1' },
        },
      ])
      .mockResolvedValue([]);

    await service.scanOnce(now);

    expect(notifications.enqueue).toHaveBeenCalledWith(prisma, [
      expect.objectContaining({
        sessionId: 's5',
        dedupeSuffix: 'seq2',
        payload: { skip: 'booked-inside-window', hours: 24 },
      }),
    ]);
  });

  it('queues the ended prompts a little after the end time', async () => {
    prisma.session.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 's3',
          endsAt: new Date(now.getTime() - 60_000),
          playerId: 'p3',
          proProfile: { userId: 'c3' },
        },
      ]);

    await service.scanOnce(now);

    expect(notifications.enqueue).toHaveBeenCalledWith(prisma, [
      expect.objectContaining({
        kind: 'SESSION_ENDED_PLAYER',
        recipientId: 'p3',
        dueAt: new Date(now.getTime() + 60_000),
      }),
      expect.objectContaining({
        kind: 'SESSION_ENDED_COACH',
        recipientId: 'c3',
      }),
    ]);
  });
});
