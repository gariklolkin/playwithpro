import { Injectable } from '@nestjs/common';
import {
  NotificationKind,
  NotificationStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dedupeKeyFor } from './notification-kinds';

/** Either the service's client or a transaction client. */
export type DbClient = PrismaService | Prisma.TransactionClient;

export interface EnqueueInput {
  kind: NotificationKind;
  sessionId: string | null;
  recipientId: string;
  /** Defaults to now. */
  dueAt?: Date;
  payload?: Prisma.InputJsonValue;
  /**
   * Distinguishes repeatable events of one kind on the same session and
   * recipient (a second reschedule proposal, a reminder for a moved time).
   */
  dedupeSuffix?: string;
}

/**
 * The write side of the outbox. `enqueue` is idempotent through the unique
 * dedupe key, so callers can run it inside the transaction that changes
 * the session state without caring about retries or races.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(db: DbClient, rows: EnqueueInput[]): Promise<void> {
    if (rows.length === 0) return;
    await db.notification.createMany({
      data: rows.map((row) => ({
        kind: row.kind,
        sessionId: row.sessionId,
        recipientId: row.recipientId,
        dedupeKey: dedupeKeyFor(
          row.kind,
          row.sessionId,
          row.recipientId,
          row.dedupeSuffix,
        ),
        dueAt: row.dueAt ?? new Date(),
        payload: row.payload,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Debounced kinds (clips changed): one row per session and recipient,
   * whose due time moves forward on every trigger. A row already sent for
   * an earlier burst is re-armed instead of duplicated.
   */
  async enqueueDebounced(
    db: DbClient,
    row: EnqueueInput & { dueAt: Date },
  ): Promise<void> {
    const dedupeKey = dedupeKeyFor(row.kind, row.sessionId, row.recipientId);
    await db.notification.upsert({
      where: { dedupeKey },
      create: {
        kind: row.kind,
        sessionId: row.sessionId,
        recipientId: row.recipientId,
        dedupeKey,
        dueAt: row.dueAt,
        payload: row.payload,
      },
      update: {
        dueAt: row.dueAt,
        status: NotificationStatus.PENDING,
        attempts: 0,
        lastError: null,
        sentAt: null,
        payload: row.payload,
      },
    });
  }

  /** Every admin account, for alert kinds. */
  async adminIds(db: DbClient): Promise<string[]> {
    const admins = await db.user.findMany({
      where: { role: Role.ADMIN },
      select: { id: true },
    });
    return admins.map((admin) => admin.id);
  }
}
