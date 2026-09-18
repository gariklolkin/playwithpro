import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountDataRequestKind as SharedKind,
  AccountDataRequestStatus as SharedStatus,
  AccountRequestStep,
  AdminAccountRequestItem,
} from '@playwithpro/shared';
import {
  AccountDataRequest,
  AccountDataRequestKind,
  AccountDataRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountDeletionService } from './account-deletion.service';
import { AccountExportService } from './account-export.service';

const LOG_PAGE = 100;

/** The admin view of the request log: read-only, plus a retry for failures. */
@Injectable()
export class AccountRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deletion: AccountDeletionService,
    private readonly exports: AccountExportService,
  ) {}

  async list(userId?: string): Promise<AdminAccountRequestItem[]> {
    const rows = await this.prisma.accountDataRequest.findMany({
      where: userId ? { userId } : {},
      orderBy: { requestedAt: 'desc' },
      take: LOG_PAGE,
    });
    return rows.map(toItem);
  }

  /** Re-runs a failed request now; completed steps are skipped. */
  async retry(id: string): Promise<AdminAccountRequestItem> {
    const request = await this.prisma.accountDataRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException();
    if (request.status !== AccountDataRequestStatus.FAILED) {
      throw new ConflictException('Only failed requests can be retried.');
    }
    if (request.kind === AccountDataRequestKind.DELETION) {
      await this.deletion.execute(request);
    } else {
      await this.exports.build(request).catch(() => undefined);
    }
    return toItem(
      await this.prisma.accountDataRequest.findUniqueOrThrow({ where: { id } }),
    );
  }
}

export function toItem(row: AccountDataRequest): AdminAccountRequestItem {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind.toLowerCase() as SharedKind,
    status: row.status.toLowerCase() as SharedStatus,
    initiatedBy: row.initiatedBy === 'ADMIN' ? 'admin' : 'self',
    adminId: row.adminId,
    reason: row.reason,
    requestedAt: row.requestedAt.toISOString(),
    scheduledFor: row.scheduledFor.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    postponedAt: row.postponedAt?.toISOString() ?? null,
    steps: (row.steps ?? {}) as unknown as Record<string, AccountRequestStep>,
    lastError: row.lastError,
  };
}
