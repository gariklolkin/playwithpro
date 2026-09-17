import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus } from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';
import {
  ERROR_REPORTER,
  type ErrorReporter,
} from '../observability/observability';
import { PrismaService } from '../prisma/prisma.service';

/** Warn once per day when this share of the limit is used. */
export const BUDGET_WARN_RATIO = 0.8;

export interface BudgetState {
  sent: number;
  limit: number;
  /** Optional emails must be skipped. */
  exhausted: boolean;
}

/**
 * The provider's daily cap (Brevo free: 300/day). Outbox sends are counted
 * from `sentAt`, direct sends (auth codes, verification flow) from the
 * mailer's in-memory counter. Transactional mail is never blocked.
 */
@Injectable()
export class EmailDailyBudget {
  private readonly logger = new Logger(EmailDailyBudget.name);
  private readonly limit: number;
  private warnedOn = '';

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    @Inject(ERROR_REPORTER) private readonly errors: ErrorReporter,
  ) {
    this.limit = config.get<number>('EMAIL_DAILY_LIMIT') ?? 300;
  }

  async state(now = new Date()): Promise<BudgetState> {
    const dayStart = new Date(
      now.toISOString().slice(0, 10) + 'T00:00:00.000Z',
    );
    const outbox = await this.prisma.notification.count({
      where: { status: NotificationStatus.SENT, sentAt: { gte: dayStart } },
    });
    const sent = outbox + this.mailer.directSentToday(now);
    const day = dayStart.toISOString().slice(0, 10);
    if (sent >= this.limit * BUDGET_WARN_RATIO && this.warnedOn !== day) {
      this.warnedOn = day;
      const message = `Email budget at ${sent}/${this.limit} for ${day}; optional emails are skipped at the limit`;
      this.logger.warn(message);
      this.errors.captureException(new Error(message), {
        source: 'email-budget',
      });
    }
    return { sent, limit: this.limit, exhausted: sent >= this.limit };
  }
}
