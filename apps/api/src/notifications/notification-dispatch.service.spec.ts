import type { ConfigService } from '@nestjs/config';
import { EmailRenderer } from '../mailer/email-renderer';
import type { MailerService } from '../mailer/mailer.service';
import type { SessionProgressionService } from '../bookings/session-progression.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmailDailyBudget } from './email-daily-budget';
import {
  BACKOFF_MINUTES,
  MAX_ATTEMPTS,
  NotificationDispatchService,
} from './notification-dispatch.service';

const HOUR = 3_600_000;

const config = {
  get: (name: string) =>
    ({ WEB_APP_URL: 'https://play-with.pro', AUTO_CONFIRM_WINDOW_HOURS: 48 })[
      name
    ],
  getOrThrow: () => 'secret',
} as unknown as ConfigService;

function sessionRow(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'session-1',
    playerId: 'player-1',
    status: 'AWAITING_CONFIRMATION',
    serviceType: 'CONSULTATION',
    startsAt: new Date(now - 2 * HOUR),
    endsAt: new Date(now - HOUR),
    priceMinor: 4005,
    platformFeeMinor: 401,
    currency: 'EUR',
    calendarSequence: 0,
    playerConfirmedAt: null,
    coachConfirmedAt: null,
    player: {
      id: 'player-1',
      email: 'p@example.com',
      displayName: 'Anna',
      locale: 'de',
      timezone: 'Europe/Berlin',
    },
    proProfile: {
      id: 'profile-1',
      userId: 'coach-1',
      user: {
        id: 'coach-1',
        email: 'c@example.com',
        displayName: 'Li',
        locale: 'en',
        timezone: 'UTC',
      },
      services: [],
    },
    _count: { videos: 0 },
    dispute: null,
    review: null,
    payments: [{ status: 'HELD' }],
    ...overrides,
  };
}

function row(kind: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    kind,
    sessionId: 'session-1',
    recipientId: 'player-1',
    dueAt: new Date(),
    status: 'PENDING',
    attempts: 0,
    payload: null,
    recipient: {
      id: 'player-1',
      email: 'p@example.com',
      displayName: 'Anna',
      locale: 'de',
      timezone: 'Europe/Berlin',
      role: 'AMATEUR',
      emailReminders: true,
      emailClipChanges: true,
      emailReviews: true,
    },
    session: sessionRow(),
    ...overrides,
  };
}

describe('NotificationDispatchService', () => {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
  };
  const mailer = { deliver: jest.fn() };
  const budget = {
    state: jest
      .fn()
      .mockResolvedValue({ sent: 0, limit: 300, exhausted: false }),
  };
  const progression = { normalize: jest.fn(<T>(s: T) => Promise.resolve(s)) };
  const calendar = {
    sendInvite: jest.fn(),
    sendCancellation: jest.fn(),
    sendUpdate: jest.fn(),
  };
  const service = new NotificationDispatchService(
    prisma as unknown as PrismaService,
    mailer as unknown as MailerService,
    new EmailRenderer(config),
    budget as unknown as EmailDailyBudget,
    progression as unknown as SessionProgressionService,
    calendar,
    config,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    budget.state.mockResolvedValue({ sent: 0, limit: 300, exhausted: false });
  });

  it('renders the session-ended prompt in the recipient locale and marks it sent', async () => {
    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_ENDED_PLAYER'),
    ]);

    await service.dispatchOnce();

    const [to, mail] = mailer.deliver.mock.calls[0] as [
      string,
      { subject: string; text: string; headers?: unknown },
    ];
    expect(to).toBe('p@example.com');
    expect(mail.subject).toBe('Hat deine Sitzung mit Li stattgefunden?');
    expect(mail.text).toContain('(Europe/Berlin)');
    expect(mail.headers).toBeUndefined();
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: expect.objectContaining({ status: 'SENT' }) as object,
    });
  });

  it('skips an optional kind the recipient turned off, and one the budget excludes', async () => {
    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_REMINDER_24H', {
        recipient: { ...row('x').recipient, emailReminders: false },
        session: sessionRow({
          status: 'PAID_ESCROW',
          startsAt: new Date(Date.now() + 20 * HOUR),
        }),
        payload: { hours: 24 },
      }),
    ]);
    await service.dispatchOnce();
    expect(mailer.deliver).not.toHaveBeenCalled();
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { status: 'SKIPPED', lastError: 'preference' },
    });

    budget.state.mockResolvedValue({ sent: 300, limit: 300, exhausted: true });
    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_REMINDER_24H', {
        session: sessionRow({
          status: 'PAID_ESCROW',
          startsAt: new Date(Date.now() + 20 * HOUR),
        }),
        payload: { hours: 24 },
      }),
    ]);
    await service.dispatchOnce();
    expect(mailer.deliver).not.toHaveBeenCalled();
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'n1' },
      data: { status: 'SKIPPED', lastError: 'budget' },
    });
  });

  it('still sends transactional mail when the budget is exhausted', async () => {
    budget.state.mockResolvedValue({ sent: 300, limit: 300, exhausted: true });
    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_ENDED_PLAYER'),
    ]);
    await service.dispatchOnce();
    expect(mailer.deliver).toHaveBeenCalledTimes(1);
  });

  it('adds the one-click unsubscribe link and headers to optional mail', async () => {
    prisma.notification.findMany.mockResolvedValue([
      row('REVIEW_RECEIVED', {
        recipientId: 'coach-1',
        recipient: {
          ...row('x').recipient,
          id: 'coach-1',
          email: 'c@example.com',
          locale: 'en',
          role: 'PROFESSIONAL',
        },
        session: sessionRow({
          status: 'COMPLETED_PAID',
          review: { rating: 5 },
        }),
        payload: { rating: 5 },
      }),
    ]);
    await service.dispatchOnce();
    const [, mail] = mailer.deliver.mock.calls[0] as [
      string,
      { text: string; headers: Record<string, string> },
    ];
    expect(mail.headers['List-Unsubscribe']).toMatch(
      /^<https:\/\/play-with\.pro\/unsubscribe\?token=/,
    );
    expect(mail.headers['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click',
    );
    expect(mail.text).toContain('Turn it off with one click');
  });

  it('skips a stale prompt (already confirmed) and a reminder for a cancelled session', async () => {
    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_ENDED_PLAYER', {
        session: sessionRow({ playerConfirmedAt: new Date() }),
      }),
    ]);
    await service.dispatchOnce();
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { status: 'SKIPPED', lastError: 'already-confirmed' },
    });

    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_REMINDER_1H', {
        session: sessionRow({ status: 'CANCELLED' }),
        payload: { hours: 1 },
      }),
    ]);
    await service.dispatchOnce();
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'n1' },
      data: { status: 'SKIPPED', lastError: 'not-upcoming' },
    });
    expect(mailer.deliver).not.toHaveBeenCalled();
  });

  it('routes invites and cancellations through the calendar provider', async () => {
    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_PAID_COACH', {
        recipientId: 'coach-1',
        recipient: {
          ...row('x').recipient,
          id: 'coach-1',
          role: 'PROFESSIONAL',
        },
        session: sessionRow({ status: 'PAID_ESCROW' }),
      }),
      row('SESSION_CANCELLED_PLAYER', {
        id: 'n2',
        session: sessionRow({ status: 'CANCELLED', calendarSequence: 1 }),
        payload: { cancelledBy: 'coach' },
      }),
    ]);
    await service.dispatchOnce();
    expect(calendar.sendInvite).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', sequence: 0 }),
      expect.objectContaining({
        email: 'c@example.com',
        role: 'coach',
        locale: 'en',
      }),
    );
    expect(calendar.sendCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 1 }),
      expect.objectContaining({ role: 'player' }),
      'coach',
    );
    expect(mailer.deliver).not.toHaveBeenCalled();
  });

  it('backs off on failure and gives up after the last attempt', async () => {
    mailer.deliver.mockRejectedValue(new Error('smtp down'));
    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_ENDED_PLAYER'),
    ]);
    const now = new Date('2026-09-16T10:00:00Z');
    await service.dispatchOnce(now);
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: {
        status: 'PENDING',
        dueAt: new Date(now.getTime() + BACKOFF_MINUTES[0] * 60_000),
        lastError: 'smtp down',
      },
    });

    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_ENDED_PLAYER', { attempts: MAX_ATTEMPTS - 1 }),
    ]);
    await service.dispatchOnce(now);
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'n1' },
      data: { status: 'FAILED', lastError: 'smtp down' },
    });
  });

  it('leaves a row alone when another dispatcher claimed it first', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.notification.findMany.mockResolvedValue([
      row('SESSION_ENDED_PLAYER'),
    ]);
    expect(await service.dispatchOnce()).toBe(0);
    expect(mailer.deliver).not.toHaveBeenCalled();
  });
});
