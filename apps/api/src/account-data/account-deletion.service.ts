import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ACCOUNT_ERROR_DELETION_BLOCKED,
  ACCOUNT_ERROR_DELETION_PENDING,
  ACCOUNT_ERROR_REAUTH_REQUIRED,
  DeletionBlocker,
  DeletionStatusResponse,
  SessionStatus as SharedSessionStatus,
} from '@playwithpro/shared';
import {
  AccountDataRequest,
  AccountDataRequestInitiator,
  AccountDataRequestKind,
  AccountDataRequestStatus,
  NotificationKind,
  PaymentStatus,
  Prisma,
  Role,
  SessionStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { TokenService } from '../auth/token.service';
import { BookingsService } from '../bookings/bookings.service';
import { EmailRenderer } from '../mailer/email-renderer';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ACCOUNT_ERASURE_HOOKS, type AccountErasureHook } from './erasure-hook';
import {
  withdrawAvailability,
  withdrawOpenVerification,
} from './hooks/core-hooks';

const DAY = 24 * 3_600_000;

/** Sessions that still owe money or attendance on either side. */
const BLOCKING_STATUSES: SessionStatus[] = [
  SessionStatus.PAID_ESCROW,
  SessionStatus.IN_PROGRESS,
  SessionStatus.AWAITING_CONFIRMATION,
  SessionStatus.DISPUTED,
];

type Steps = Record<string, { status: string; at: string; error?: string }>;

/** Prisma client or the transaction client of an open transaction. */
type Db = Prisma.TransactionClient | PrismaService;

/**
 * The deletion request lifecycle. A request is refused while money or
 * attendance is unsettled, needs the user's credential, and does the
 * visible part at once (other sessions out, coach off the market, unpaid
 * bookings gone); the irreversible part runs after the grace period through
 * the erasure hooks, each step recorded so a failed run resumes. The user
 * row is never deleted: it becomes a tombstone the money trail can still
 * point at.
 */
@Injectable()
export class AccountDeletionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
    private readonly bookings: BookingsService,
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
    private readonly renderer: EmailRenderer,
    private readonly scheduling: SchedulingService,
    @Inject(ACCOUNT_ERASURE_HOOKS) private readonly hooks: AccountErasureHook[],
  ) {}

  onApplicationBootstrap(): void {
    void this.sweep();
  }

  private get graceDays(): number {
    return this.config.getOrThrow<number>('ACCOUNT_DELETION_GRACE_DAYS');
  }

  /** What stands in the way of deleting this account right now. */
  async blockers(
    userId: string,
    db: Db = this.prisma,
  ): Promise<DeletionBlocker[]> {
    const sessions = await db.session.findMany({
      where: {
        OR: [{ playerId: userId }, { proProfile: { userId } }],
        status: { in: BLOCKING_STATUSES },
      },
      select: {
        id: true,
        status: true,
        serviceType: true,
        startsAt: true,
        playerId: true,
      },
      orderBy: { startsAt: 'asc' },
    });
    const held = await db.payment.findMany({
      where: {
        status: PaymentStatus.HELD,
        session: { OR: [{ playerId: userId }, { proProfile: { userId } }] },
      },
      select: { sessionId: true, amountMinor: true, currency: true },
    });
    const blockers: DeletionBlocker[] = sessions.map((session) => ({
      kind: 'session',
      sessionId: session.id,
      status: session.status.toLowerCase() as SharedSessionStatus,
      serviceType: toSharedServiceType(session.serviceType),
      startsAt: session.startsAt.toISOString(),
      role: session.playerId === userId ? 'player' : 'coach',
    }));
    const listed = new Set(sessions.map((session) => session.id));
    for (const payment of held) {
      if (!listed.has(payment.sessionId)) {
        blockers.push({
          kind: 'held_payment',
          sessionId: payment.sessionId,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
        });
      }
    }
    return blockers;
  }

  private async assertNoBlockers(userId: string, db: Db = this.prisma) {
    const blockers = await this.blockers(userId, db);
    if (blockers.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: ACCOUNT_ERROR_DELETION_BLOCKED,
        message: 'Settle your open sessions and payments first.',
        blockers,
      });
    }
  }

  async status(userId: string): Promise<DeletionStatusResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { deletionScheduledFor: true, passwordHash: true },
    });
    const pending = user.deletionScheduledFor
      ? await this.prisma.accountDataRequest.findFirst({
          where: {
            userId,
            kind: AccountDataRequestKind.DELETION,
            status: {
              in: [
                AccountDataRequestStatus.SCHEDULED,
                AccountDataRequestStatus.POSTPONED,
              ],
            },
          },
          select: { postponedAt: true, initiatedBy: true },
        })
      : null;
    return {
      scheduledFor: user.deletionScheduledFor?.toISOString() ?? null,
      postponed: Boolean(pending?.postponedAt),
      initiatedBy: pending
        ? pending.initiatedBy === AccountDataRequestInitiator.ADMIN
          ? 'admin'
          : 'self'
        : null,
      blockers: user.deletionScheduledFor ? [] : await this.blockers(userId),
      reauth: user.passwordHash ? 'password' : 'code',
      graceDays: this.graceDays,
    };
  }

  /** Emails the six-digit code Google-only accounts re-authenticate with. */
  async sendCode(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, locale: true, passwordHash: true },
    });
    if (user.passwordHash) {
      throw new ConflictException(
        'This account re-authenticates with its password.',
      );
    }
    const code = await this.tokens.createEmailCode(userId, 'account_deletion');
    await this.mailer.deliver(
      user.email,
      this.renderer.render(user.locale, 'account.deletionCode', { code }),
    );
  }

  /** Self-service: blockers, credential, then the request. */
  async request(
    userId: string,
    proof: { password?: string; code?: string },
  ): Promise<DeletionStatusResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, passwordHash: true, deletionScheduledFor: true },
    });
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException(
        'Admin accounts are deleted by another admin.',
      );
    }
    if (user.deletionScheduledFor) {
      throw new ConflictException({
        statusCode: 409,
        code: ACCOUNT_ERROR_DELETION_PENDING,
        message: 'This account is already scheduled for deletion.',
      });
    }
    // Blockers first: a one-time code must not be burnt on a refused request.
    await this.assertNoBlockers(userId);
    if (user.passwordHash) {
      if (
        !proof.password ||
        !(await argon2.verify(user.passwordHash, proof.password))
      ) {
        throw new BadRequestException({
          statusCode: 400,
          code: ACCOUNT_ERROR_REAUTH_REQUIRED,
          message: 'Enter your current password.',
        });
      }
    } else {
      if (!proof.code) {
        throw new BadRequestException({
          statusCode: 400,
          code: ACCOUNT_ERROR_REAUTH_REQUIRED,
          message: 'Enter the code we emailed you.',
        });
      }
      await this.tokens.consumeEmailCode(
        userId,
        proof.code,
        'account_deletion',
      );
    }
    await this.schedule(userId, {
      initiatedBy: AccountDataRequestInitiator.SELF,
      graceDays: this.graceDays,
    });
    return this.status(userId);
  }

  /** An admin's request: the same path, with who and why. */
  async requestByAdmin(
    adminId: string,
    userId: string,
    reason: string,
    graceDays?: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true, deletionScheduledFor: true },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException();
    }
    if (user.role === Role.ADMIN) {
      if (userId === adminId) {
        throw new ForbiddenException(
          'Ask another admin to delete your account.',
        );
      }
      const otherAdmins = await this.prisma.user.count({
        where: { role: Role.ADMIN, deletedAt: null, id: { not: userId } },
      });
      if (otherAdmins === 0) {
        throw new ConflictException(
          'The last admin account cannot be deleted.',
        );
      }
    }
    if (user.deletionScheduledFor) {
      throw new ConflictException(
        'This account is already scheduled for deletion.',
      );
    }
    await this.schedule(userId, {
      initiatedBy: AccountDataRequestInitiator.ADMIN,
      adminId,
      reason,
      graceDays: graceDays ?? this.graceDays,
    });
  }

  /**
   * The request: blockers, the row, the schedule stamp and every visible
   * side effect. Everything the counterpart or the public can see changes
   * now; the data itself waits for the job.
   */
  private async schedule(
    userId: string,
    options: {
      initiatedBy: AccountDataRequestInitiator;
      adminId?: string;
      reason?: string;
      graceDays: number;
    },
  ): Promise<void> {
    await this.assertNoBlockers(userId);
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + options.graceDays * DAY);
    const request = await this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.user.updateMany({
          where: { id: userId, deletionScheduledFor: null, deletedAt: null },
          data: { deletionScheduledFor: scheduledFor },
        });
        if (claimed.count === 0) {
          throw new ConflictException(
            'This account is already scheduled for deletion.',
          );
        }
        // The stamp above locks the user row; a payment in flight either
        // committed before it (seen here) or waits for it and then refuses.
        await this.assertNoBlockers(userId, tx);
        const created = await tx.accountDataRequest.create({
          data: {
            userId,
            kind: AccountDataRequestKind.DELETION,
            initiatedBy: options.initiatedBy,
            adminId: options.adminId ?? null,
            reason: options.reason ?? null,
            scheduledFor,
          },
        });
        // Everyone else is signed out; the requester's browser refreshes.
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await this.notifications.enqueue(tx, [
          {
            kind:
              options.initiatedBy === AccountDataRequestInitiator.ADMIN
                ? NotificationKind.ACCOUNT_DELETION_BY_ADMIN
                : NotificationKind.ACCOUNT_DELETION_REQUESTED,
            sessionId: null,
            recipientId: userId,
            dedupeSuffix: created.id,
            payload: { scheduledFor: scheduledFor.toISOString() },
          },
        ]);
        return created;
        // Argon2 and a loaded CI box: the default 5 s interactive-transaction
        // budget is too tight for a request that holds only one user row.
      },
      { timeout: 15_000 },
    );
    // Follow-ups outside the transaction: each is idempotent and the job's
    // hooks repeat them at execution anyway.
    await this.bookings.cancelUnpaidOf(userId);
    const profile = await this.prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (profile) {
      await withdrawAvailability(this.prisma, profile.id);
      await withdrawOpenVerification(this.prisma, this.scheduling, userId);
    }
    this.logger.log(
      `Deletion ${request.id} scheduled for user ${userId} (${options.initiatedBy}) at ${scheduledFor.toISOString()}`,
    );
  }

  /**
   * The user changed their mind inside the grace period. A deletion an
   * admin scheduled is theirs to undo, not the user's.
   */
  async cancel(userId: string): Promise<DeletionStatusResponse> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.accountDataRequest.findFirst({
        where: {
          userId,
          kind: AccountDataRequestKind.DELETION,
          status: {
            in: [
              AccountDataRequestStatus.SCHEDULED,
              AccountDataRequestStatus.POSTPONED,
            ],
          },
        },
      });
      if (request?.initiatedBy === AccountDataRequestInitiator.ADMIN) {
        throw new ForbiddenException(
          'This deletion was scheduled by our team; reply to the email to contest it.',
        );
      }
      const restored = await tx.user.updateMany({
        where: {
          id: userId,
          deletionScheduledFor: { not: null },
          deletedAt: null,
        },
        data: { deletionScheduledFor: null },
      });
      if (!request || restored.count === 0) {
        throw new ConflictException(
          'No deletion is scheduled for this account.',
        );
      }
      await tx.accountDataRequest.update({
        where: { id: request.id },
        data: { status: AccountDataRequestStatus.CANCELLED, cancelledAt: now },
      });
      await this.notifications.enqueue(tx, [
        {
          kind: NotificationKind.ACCOUNT_DELETION_CANCELLED,
          sessionId: null,
          recipientId: userId,
          dedupeSuffix: request.id,
        },
      ]);
    });
    return this.status(userId);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    try {
      await this.runDue();
    } catch (error) {
      this.logger.error(
        'Account deletion sweep failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Executes every due deletion; public for tests. Failed requests are not
   * picked up again: an admin retries them from the console once the cause
   * is fixed.
   */
  async runDue(now = new Date()): Promise<void> {
    const due = await this.prisma.accountDataRequest.findMany({
      where: {
        kind: AccountDataRequestKind.DELETION,
        status: {
          in: [
            AccountDataRequestStatus.SCHEDULED,
            AccountDataRequestStatus.POSTPONED,
          ],
        },
        scheduledFor: { lte: now },
      },
      take: 20,
    });
    for (const request of due) {
      try {
        await this.execute(request, now);
      } catch (error) {
        this.logger.error(
          `Deletion ${request.id} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /** One request through the hooks; resumable, tombstone last. */
  async execute(request: AccountDataRequest, now = new Date()): Promise<void> {
    const blockers = await this.blockers(request.userId);
    if (blockers.length > 0) {
      const scheduledFor = new Date(
        now.getTime() +
          this.config.getOrThrow<number>('ACCOUNT_DELETION_POSTPONE_DAYS') *
            DAY,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.accountDataRequest.update({
          where: { id: request.id },
          data: {
            status: AccountDataRequestStatus.POSTPONED,
            postponedAt: now,
            scheduledFor,
          },
        });
        await tx.user.update({
          where: { id: request.userId },
          data: { deletionScheduledFor: scheduledFor },
        });
        await this.notifications.enqueue(tx, [
          {
            kind: NotificationKind.ACCOUNT_DELETION_POSTPONED,
            sessionId: null,
            recipientId: request.userId,
            dedupeSuffix: `${request.id}:${scheduledFor.toISOString()}`,
            payload: { scheduledFor: scheduledFor.toISOString() },
          },
        ]);
      });
      this.logger.log(
        `Deletion ${request.id} postponed: ${blockers.length} blocker(s)`,
      );
      return;
    }

    const claimed = await this.prisma.accountDataRequest.updateMany({
      where: { id: request.id, status: request.status },
      data: { status: AccountDataRequestStatus.RUNNING },
    });
    if (claimed.count === 0) return;
    try {
      await this.runSteps(request);
    } catch (error) {
      // Nothing may stay RUNNING: the console retries FAILED rows only.
      await this.prisma.accountDataRequest.update({
        where: { id: request.id },
        data: {
          status: AccountDataRequestStatus.FAILED,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /** The hooks in order, then the tombstone; throws on anything unexpected. */
  private async runSteps(request: AccountDataRequest): Promise<void> {
    const steps: Steps = (request.steps as Steps | null) ?? {};
    let failed = false;
    for (const hook of this.hooks) {
      if (steps[hook.name]?.status === 'done') continue;
      try {
        const outcome = await hook.erase(request.userId);
        steps[hook.name] =
          outcome.status === 'done'
            ? { status: 'done', at: new Date().toISOString() }
            : {
                status: 'skipped',
                at: new Date().toISOString(),
                error: outcome.reason,
              };
      } catch (error) {
        failed = true;
        steps[hook.name] = {
          status: 'failed',
          at: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        };
        this.logger.error(`Deletion ${request.id}: step ${hook.name} failed`);
      }
      await this.prisma.accountDataRequest.update({
        where: { id: request.id },
        data: { steps },
      });
    }
    if (failed) {
      await this.prisma.accountDataRequest.update({
        where: { id: request.id },
        data: {
          status: AccountDataRequestStatus.FAILED,
          lastError: 'One or more steps failed; retry from the console.',
        },
      });
      return;
    }
    await this.tombstone(request.userId);
    await this.prisma.accountDataRequest.update({
      where: { id: request.id },
      data: {
        status: AccountDataRequestStatus.COMPLETED,
        completedAt: new Date(),
        lastError: null,
        steps: {
          ...steps,
          tombstone: { status: 'done', at: new Date().toISOString() },
        },
      },
    });
    this.logger.log(
      `Deletion ${request.id} completed for user ${request.userId}`,
    );
  }

  /**
   * After a database restore: executed deletions the restored rows predate
   * are applied again — every hook, then the tombstone, without emails.
   * Takes the user ids saved before the restore and adds every deletion the
   * restored database itself records as completed. Idempotent.
   */
  async reapply(savedUserIds: string[] = []): Promise<string[]> {
    const recorded = await this.prisma.accountDataRequest.findMany({
      where: {
        kind: AccountDataRequestKind.DELETION,
        status: AccountDataRequestStatus.COMPLETED,
      },
      select: { userId: true },
    });
    const userIds = [
      ...new Set([...savedUserIds, ...recorded.map((row) => row.userId)]),
    ];
    const applied: string[] = [];
    for (const userId of userIds) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) continue;
      for (const hook of this.hooks) {
        await hook.erase(userId);
      }
      await this.tombstone(userId, { notify: false, force: true });
      if (!recorded.some((row) => row.userId === userId)) {
        const now = new Date();
        await this.prisma.accountDataRequest.create({
          data: {
            userId,
            kind: AccountDataRequestKind.DELETION,
            status: AccountDataRequestStatus.COMPLETED,
            initiatedBy: AccountDataRequestInitiator.ADMIN,
            reason: 'Re-applied after a backup restore.',
            scheduledFor: now,
            completedAt: now,
          },
        });
      }
      applied.push(userId);
    }
    return applied;
  }

  /**
   * The last step: the row keeps only what the money trail needs, then the
   * completion email goes to the address read before the scrub — after the
   * commit, so a failed scrub retried later does not send it twice.
   */
  private async tombstone(
    userId: string,
    options: { notify: boolean; force?: boolean } = { notify: true },
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, locale: true, displayName: true, deletedAt: true },
    });
    if (user.deletedAt && !options.force) return;
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@invalid`,
          displayName: '',
          passwordHash: null,
          avatarKey: null,
          locale: 'en',
          timezone: 'UTC',
          emailVerifiedAt: null,
          emailReminders: false,
          emailClipChanges: false,
          emailReviews: false,
          deletionScheduledFor: null,
          deletedAt: user.deletedAt ?? new Date(),
        },
      }),
      // Nothing queued for this address may go out after the scrub.
      this.prisma.notification.updateMany({
        where: { recipientId: userId, status: 'PENDING' },
        data: { status: 'SKIPPED', lastError: 'account-deleted' },
      }),
    ]);
    if (options.notify) {
      await this.mailer.send(
        user.email,
        this.renderer.render(user.locale, 'account.deletionCompleted', {
          name: user.displayName,
        }),
      );
    }
  }
}
