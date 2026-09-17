import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationKind, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const HOUR = 3_600_000;
/** Post-end facts older than this never trigger mail (first deploy, restores). */
export const SCAN_LOOKBACK_MS = 7 * 24 * HOUR;
/** A little after the end so the progression sweep has normalized the status. */
const ENDED_GRACE_MS = 2 * 60_000;

/**
 * Inserts the clock-driven outbox rows by scanning session facts, never by
 * hooking transitions — read paths move status inline and would bypass any
 * hook. Idempotent through the dedupe key; the `notifications: { none }`
 * filters keep each scan cheap.
 */
@Injectable()
export class NotificationScanService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    void this.scan();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scan(): Promise<void> {
    try {
      await this.scanOnce();
    } catch (error) {
      this.logger.error(
        'Notification scan failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async scanOnce(now = new Date()): Promise<void> {
    await this.reminders(24, NotificationKind.SESSION_REMINDER_24H, now);
    await this.reminders(1, NotificationKind.SESSION_REMINDER_1H, now);
    await this.ended(now);
  }

  /**
   * Paid sessions starting inside the window that were paid before the
   * window opened (a last-minute booking gets its receipt instead).
   */
  private async reminders(
    hoursBefore: number,
    kind: NotificationKind,
    now: Date,
  ): Promise<void> {
    const windowMs = hoursBefore * HOUR;
    const due = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.PAID_ESCROW,
        startsAt: { gt: now, lte: new Date(now.getTime() + windowMs) },
        inviteSentAt: { not: null },
        notifications: { none: { kind } },
      },
      select: {
        id: true,
        startsAt: true,
        inviteSentAt: true,
        playerId: true,
        proProfile: { select: { userId: true } },
      },
      take: 100,
    });
    for (const session of due) {
      const paidAt = session.inviteSentAt as Date;
      if (paidAt.getTime() > session.startsAt.getTime() - windowMs) {
        // Booked inside the window: nothing to remind about, but record the
        // decision so the scan stops re-reading this session.
        await this.notifications.enqueue(this.prisma, [
          {
            kind,
            sessionId: session.id,
            recipientId: session.playerId,
            payload: { skip: 'booked-inside-window', hours: hoursBefore },
          },
        ]);
        continue;
      }
      await this.notifications.enqueue(this.prisma, [
        {
          kind,
          sessionId: session.id,
          recipientId: session.playerId,
          payload: { hours: hoursBefore },
        },
        {
          kind,
          sessionId: session.id,
          recipientId: session.proProfile.userId,
          payload: { hours: hoursBefore },
        },
      ]);
    }
  }

  /** Paid sessions whose end passed: the confirmation prompts for both parties. */
  private async ended(now: Date): Promise<void> {
    const due = await this.prisma.session.findMany({
      where: {
        status: {
          in: [
            SessionStatus.PAID_ESCROW,
            SessionStatus.IN_PROGRESS,
            SessionStatus.AWAITING_CONFIRMATION,
          ],
        },
        endsAt: {
          lte: now,
          gte: new Date(now.getTime() - SCAN_LOOKBACK_MS),
        },
        inviteSentAt: { not: null },
        notifications: {
          none: { kind: NotificationKind.SESSION_ENDED_PLAYER },
        },
      },
      select: {
        id: true,
        endsAt: true,
        playerId: true,
        proProfile: { select: { userId: true } },
      },
      take: 100,
    });
    for (const session of due) {
      const dueAt = new Date(session.endsAt.getTime() + ENDED_GRACE_MS);
      await this.notifications.enqueue(this.prisma, [
        {
          kind: NotificationKind.SESSION_ENDED_PLAYER,
          sessionId: session.id,
          recipientId: session.playerId,
          dueAt,
        },
        {
          kind: NotificationKind.SESSION_ENDED_COACH,
          sessionId: session.id,
          recipientId: session.proProfile.userId,
          dueAt,
        },
      ]);
    }
  }
}
