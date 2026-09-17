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
   * Paid sessions starting inside the window that were paid — or last moved
   * — before the window opened (a last-minute booking or move gets its
   * receipt or calendar update instead). A reminder belongs to one time: once
   * a session was rescheduled, reminders are keyed by the calendar sequence,
   * so the new time gets its own even if the old one was already reminded.
   */
  private async reminders(
    hoursBefore: number,
    kind: NotificationKind,
    now: Date,
  ): Promise<void> {
    const windowMs = hoursBefore * HOUR;
    const candidates = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.PAID_ESCROW,
        startsAt: { gt: now, lte: new Date(now.getTime() + windowMs) },
        inviteSentAt: { not: null },
        OR: [
          { notifications: { none: { kind } } },
          { rescheduledAt: { not: null } },
        ],
      },
      select: {
        id: true,
        startsAt: true,
        inviteSentAt: true,
        rescheduledAt: true,
        calendarSequence: true,
        playerId: true,
        proProfile: { select: { userId: true } },
        notifications: { where: { kind }, select: { createdAt: true } },
      },
      take: 100,
    });
    for (const session of candidates) {
      const movedAt = session.rescheduledAt;
      // Already decided for the current time (rows written after the move).
      if (
        session.notifications.some(
          (row) => movedAt === null || row.createdAt >= movedAt,
        )
      ) {
        continue;
      }
      const dedupeSuffix =
        movedAt === null ? undefined : `seq${session.calendarSequence}`;
      // inviteSentAt is non-null by the query's filter.
      const settledAt = movedAt ?? session.inviteSentAt ?? now;
      if (settledAt.getTime() > session.startsAt.getTime() - windowMs) {
        // Booked or moved inside the window: nothing to remind about, but
        // record the decision so the scan stops re-reading this session.
        await this.notifications.enqueue(this.prisma, [
          {
            kind,
            sessionId: session.id,
            recipientId: session.playerId,
            dedupeSuffix,
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
          dedupeSuffix,
          payload: { hours: hoursBefore },
        },
        {
          kind,
          sessionId: session.id,
          recipientId: session.proProfile.userId,
          dedupeSuffix,
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
