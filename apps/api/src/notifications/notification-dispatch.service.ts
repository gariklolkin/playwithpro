import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DisputeKind,
  DisputeStatus,
  NotificationKind,
  NotificationStatus,
  PaymentStatus,
  Prisma,
  ServiceType,
  SessionStatus,
} from '@prisma/client';
import { SessionProgressionService } from '../bookings/session-progression.service';
import {
  CALENDAR_PROVIDER,
  type CalendarProvider,
} from '../calendar/calendar-provider';
import {
  EmailRenderer,
  formatMoney,
  formatWhen,
  type EmailParams,
} from '../mailer/email-renderer';
import { MailerService, type OutgoingMail } from '../mailer/mailer.service';
import {
  sessionEmailParams,
  type EmailRecipient,
} from '../mailer/session-email-params';
import { PrismaService } from '../prisma/prisma.service';
import { EmailDailyBudget } from './email-daily-budget';
import { KIND_META, isTransactional } from './notification-kinds';
import {
  SESSION_EMAIL_INCLUDE,
  attendeeOf,
  calendarInput,
  sessionFacts,
  type SessionEmailRow,
} from './session-email-context';
import { signUnsubscribeToken } from './unsubscribe-token';

/** Rows claimed per tick; a minute of SMTP at low volume. */
export const DISPATCH_BATCH = 25;
export const MAX_ATTEMPTS = 5;
/** Minutes before the next try, by attempt number (1-based). */
export const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

const ROW_INCLUDE = {
  recipient: {
    select: {
      id: true,
      email: true,
      displayName: true,
      locale: true,
      timezone: true,
      role: true,
      emailReminders: true,
      emailClipChanges: true,
      emailReviews: true,
    },
  },
  session: { include: SESSION_EMAIL_INCLUDE },
} as const satisfies Prisma.NotificationInclude;

type Row = Prisma.NotificationGetPayload<{ include: typeof ROW_INCLUDE }>;

type Payload = Record<string, string | number | undefined>;

/**
 * The read side of the outbox: claims due rows, decides whether each still
 * applies, renders in the recipient's locale and timezone, sends, and
 * records the outcome. Failures back off and give up after MAX_ATTEMPTS.
 */
@Injectable()
export class NotificationDispatchService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationDispatchService.name);
  private readonly autoConfirmHours: number;
  private readonly unsubscribeSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly renderer: EmailRenderer,
    private readonly budget: EmailDailyBudget,
    private readonly progression: SessionProgressionService,
    @Inject(CALENDAR_PROVIDER) private readonly calendar: CalendarProvider,
    config: ConfigService,
  ) {
    this.autoConfirmHours =
      config.get<number>('AUTO_CONFIRM_WINDOW_HOURS') ?? 48;
    this.unsubscribeSecret = config.getOrThrow<string>(
      'NOTIFY_UNSUBSCRIBE_SECRET',
    );
  }

  onApplicationBootstrap(): void {
    void this.dispatch();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatch(): Promise<void> {
    try {
      await this.dispatchOnce();
    } catch (error) {
      this.logger.error(
        'Notification dispatch failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async dispatchOnce(now = new Date()): Promise<number> {
    const due = await this.prisma.notification.findMany({
      where: { status: NotificationStatus.PENDING, dueAt: { lte: now } },
      orderBy: { dueAt: 'asc' },
      take: DISPATCH_BATCH,
      include: ROW_INCLUDE,
    });
    let handled = 0;
    for (const row of due) {
      // The conditional update is the claim: a concurrent dispatcher (or a
      // restart mid-batch) sees 0 rows and moves on.
      const claimed = await this.prisma.notification.updateMany({
        where: {
          id: row.id,
          status: NotificationStatus.PENDING,
          attempts: row.attempts,
        },
        data: { attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue;
      await this.handle({ ...row, attempts: row.attempts + 1 }, now);
      handled += 1;
    }
    return handled;
  }

  private async handle(row: Row, now: Date): Promise<void> {
    const meta = KIND_META[row.kind];
    if (meta.preference && !row.recipient[meta.preference]) {
      await this.skip(row, 'preference');
      return;
    }
    const payload = (row.payload ?? {}) as Payload;
    if (payload.skip) {
      await this.skip(row, String(payload.skip));
      return;
    }
    const reason = await this.staleReason(row, now);
    if (reason) {
      await this.skip(row, reason);
      return;
    }
    if (
      !isTransactional(row.kind) &&
      (await this.budget.state(now)).exhausted
    ) {
      await this.skip(row, 'budget');
      return;
    }
    try {
      await this.send(row, payload);
      await this.prisma.notification.update({
        where: { id: row.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (row.attempts >= MAX_ATTEMPTS) {
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { status: NotificationStatus.FAILED, lastError: message },
        });
        this.logger.error(
          `Notification ${row.id} (${row.kind}) failed for good: ${message}`,
        );
        return;
      }
      const minutes =
        BACKOFF_MINUTES[Math.min(row.attempts, BACKOFF_MINUTES.length) - 1];
      await this.prisma.notification.update({
        where: { id: row.id },
        data: {
          status: NotificationStatus.PENDING,
          dueAt: new Date(now.getTime() + minutes * 60_000),
          lastError: message,
        },
      });
      this.logger.warn(
        `Notification ${row.id} (${row.kind}) attempt ${row.attempts} failed; retry in ${minutes} min`,
      );
    }
  }

  private async skip(row: Row, reason: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id: row.id },
      data: { status: NotificationStatus.SKIPPED, lastError: reason },
    });
  }

  /** Why a due row no longer applies; null when it should be sent. */
  private async staleReason(row: Row, now: Date): Promise<string | null> {
    const session = row.session;
    if (!session) return 'no-session';
    const upcoming =
      session.status === SessionStatus.PAID_ESCROW && session.startsAt > now;
    switch (row.kind) {
      case NotificationKind.SESSION_PAID_PLAYER:
      case NotificationKind.SESSION_PAID_COACH:
        return session.status === SessionStatus.CANCELLED ? 'cancelled' : null;
      case NotificationKind.SESSION_CLIPS_CHANGED:
      case NotificationKind.SESSION_REMINDER_24H:
      case NotificationKind.SESSION_REMINDER_1H:
        return upcoming ? null : 'not-upcoming';
      case NotificationKind.SESSION_ENDED_PLAYER:
      case NotificationKind.SESSION_ENDED_COACH: {
        // Read paths may not have normalized the status yet.
        const current = await this.progression.normalize(session);
        if (current.status !== SessionStatus.AWAITING_CONFIRMATION) {
          return `status-${current.status.toLowerCase()}`;
        }
        if (
          row.kind === NotificationKind.SESSION_ENDED_PLAYER &&
          session.playerConfirmedAt
        ) {
          return 'already-confirmed';
        }
        if (
          row.kind === NotificationKind.SESSION_ENDED_COACH &&
          session.coachConfirmedAt
        ) {
          return 'already-confirmed';
        }
        return null;
      }
      case NotificationKind.SESSION_COMPLETED_PLAYER:
      case NotificationKind.SESSION_COMPLETED_COACH:
        return session.payments[0]?.status === PaymentStatus.RELEASED
          ? null
          : 'not-released';
      case NotificationKind.DISPUTE_OPENED_PLAYER:
      case NotificationKind.DISPUTE_OPENED_COACH:
      case NotificationKind.DISPUTE_OPENED_ADMIN:
        return session.dispute ? null : 'no-dispute';
      case NotificationKind.DISPUTE_RESOLVED_PLAYER:
      case NotificationKind.DISPUTE_RESOLVED_COACH:
        return session.dispute?.status === DisputeStatus.RESOLVED &&
          session.payments[0]?.status !== PaymentStatus.HELD
          ? null
          : 'not-settled';
      case NotificationKind.SESSION_CANCELLED_PLAYER:
      case NotificationKind.SESSION_CANCELLED_COACH:
      case NotificationKind.SESSION_CANCELLED_ADMIN:
        return session.status === SessionStatus.CANCELLED
          ? null
          : 'not-cancelled';
      case NotificationKind.REVIEW_RECEIVED:
        return session.review ? null : 'no-review';
      default:
        return null;
    }
  }

  private recipientOf(row: Row): EmailRecipient {
    const role =
      row.recipient.role === 'ADMIN'
        ? 'admin'
        : row.recipient.id === row.session?.playerId
          ? 'player'
          : 'coach';
    return {
      displayName: row.recipient.displayName,
      locale: row.recipient.locale,
      timezone: row.recipient.timezone,
      role,
    };
  }

  private async send(row: Row, payload: Payload): Promise<void> {
    const session = row.session as SessionEmailRow;
    const recipient = this.recipientOf(row);
    const locale = this.renderer.resolveLocale(recipient.locale);
    const input = calendarInput(session);

    // Calendar kinds go through the provider (it owns the .ics).
    if (row.kind === NotificationKind.SESSION_PAID_PLAYER) {
      await this.calendar.sendInvite(input, attendeeOf(session, 'player'));
      return;
    }
    if (row.kind === NotificationKind.SESSION_PAID_COACH) {
      await this.calendar.sendInvite(input, attendeeOf(session, 'coach'));
      return;
    }
    if (
      row.kind === NotificationKind.SESSION_CANCELLED_PLAYER ||
      row.kind === NotificationKind.SESSION_CANCELLED_COACH
    ) {
      await this.calendar.sendCancellation(
        input,
        attendeeOf(
          session,
          row.kind === NotificationKind.SESSION_CANCELLED_PLAYER
            ? 'player'
            : 'coach',
        ),
        payload.cancelledBy === 'coach' ? 'coach' : 'player',
      );
      return;
    }

    const facts = sessionFacts(session);
    const params: EmailParams = {
      ...sessionEmailParams(this.renderer, facts, recipient),
      ...this.extraParams(row, payload, locale, recipient),
    };
    const meta = KIND_META[row.kind];
    let mail: OutgoingMail;
    if (meta.preference) {
      const token = signUnsubscribeToken(this.unsubscribeSecret, {
        userId: row.recipient.id,
        category: meta.preference,
      });
      const unsubscribeUrl = `${this.renderer.link(locale, '/unsubscribe')}?token=${token}`;
      mail = {
        ...this.renderer.render(locale, meta.messageKey, params, {
          unsubscribeUrl,
        }),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      };
    } else {
      mail = this.renderer.render(locale, meta.messageKey, params);
    }
    await this.mailer.deliver(row.recipient.email, mail);
  }

  /** Kind-specific parameters on top of the shared session ones. */
  private extraParams(
    row: Row,
    payload: Payload,
    locale: string,
    recipient: EmailRecipient,
  ): EmailParams {
    const session = row.session as SessionEmailRow;
    const deadline = formatWhen(
      new Date(session.endsAt.getTime() + this.autoConfirmHours * 3_600_000),
      locale,
      recipient.timezone,
    );
    switch (row.kind) {
      case NotificationKind.SESSION_REMINDER_24H:
      case NotificationKind.SESSION_REMINDER_1H:
        return {
          hours: row.kind === NotificationKind.SESSION_REMINDER_24H ? 24 : 1,
          clipsHint:
            session.serviceType === ServiceType.VIDEO_ANALYSIS &&
            session._count.videos > 0
              ? this.renderer.message(locale, 'session.reminder.clipsHint')
              : '',
        };
      case NotificationKind.SESSION_ENDED_PLAYER:
      case NotificationKind.SESSION_ENDED_COACH:
        return { deadline };
      case NotificationKind.SESSION_COMPLETED_PLAYER:
        return { reviewUrl: this.renderer.link(locale, '/dashboard/sessions') };
      case NotificationKind.DISPUTE_OPENED_PLAYER:
      case NotificationKind.DISPUTE_OPENED_COACH: {
        const disputeKind = (
          session.dispute?.kind ?? DisputeKind.PLAYER_REPORTED
        ).toLowerCase();
        if (disputeKind === 'player_reported') {
          return { disputeKind, systemLine: '' };
        }
        // A system-opened dispute: either the refund date the coach can
        // still prevent, or the promise that an admin decides.
        const role =
          row.kind === NotificationKind.DISPUTE_OPENED_PLAYER
            ? 'player'
            : 'coach';
        const dueAt = session.dispute?.responseDueAt ?? null;
        return {
          disputeKind,
          systemLine: this.renderer.message(
            locale,
            `dispute.opened.systemLine.${role}${dueAt ? 'Deadline' : 'Admin'}`,
            {
              amount: formatMoney(session.priceMinor, session.currency, locale),
              respondBy: dueAt
                ? formatWhen(dueAt, locale, recipient.timezone)
                : '',
            },
          ),
        };
      }
      case NotificationKind.DISPUTE_OPENED_ADMIN:
        return {
          url: this.renderer.link(locale, '/dashboard/disputes'),
          disputeKind: (
            session.dispute?.kind ?? DisputeKind.PLAYER_REPORTED
          ).toLowerCase(),
        };
      case NotificationKind.DISPUTE_RESOLVED_PLAYER:
      case NotificationKind.DISPUTE_RESOLVED_COACH:
        return {
          outcome: session.dispute?.outcome === 'REFUND' ? 'refund' : 'release',
          via: (session.dispute?.resolvedVia ?? 'ADMIN').toLowerCase(),
        };
      case NotificationKind.SESSION_CANCELLED_ADMIN:
        return {
          url: this.renderer.link(locale, '/dashboard/admin/transactions'),
        };
      case NotificationKind.REVIEW_RECEIVED:
        return {
          rating: Number(payload.rating ?? session.review?.rating ?? 0),
          url: this.renderer.link(locale, `/coaches/${session.proProfile.id}`),
        };
      default:
        return {};
    }
  }
}
