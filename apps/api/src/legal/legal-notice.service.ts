import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  LEGAL_DOCUMENT_KEYS,
  LEGAL_DOCUMENTS,
  LegalDocument,
  currentLegalVersion,
  isOlderVersion,
} from '@playwithpro/shared';
import { NotificationKind, Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const BATCH = 200;

/**
 * Tells users about a newer version of a document they accepted — once per
 * user and version (the outbox key carries both). Versions ship with
 * deploys, so this is a sweep, not a publish hook: it only ever looks at
 * documents with more than one version, so nothing fires at launch.
 */
@Injectable()
export class LegalNoticeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegalNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    void this.sweep();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    try {
      await this.sweepOnce();
    } catch (error) {
      this.logger.error(
        'Legal notice sweep failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async sweepOnce(): Promise<void> {
    for (const document of LEGAL_DOCUMENT_KEYS) {
      const entry = LEGAL_DOCUMENTS[document];
      if (!entry.accepted || entry.versions.length < 2) continue;
      await this.notifyOutdated(document);
    }
  }

  private async notifyOutdated(document: LegalDocument): Promise<void> {
    const current = currentLegalVersion(document);
    const suffix = `${document}:${current.version}`;
    // Users who ever accepted this document and were not yet told about the
    // current version; their latest version is checked in code.
    const candidates = await this.prisma.user.findMany({
      where: {
        legalAcceptances: { some: { document } },
        notifications: {
          none: {
            kind: NotificationKind.LEGAL_UPDATE_NOTICE,
            dedupeKey: { endsWith: `:${suffix}` },
          },
        },
        ...(document === LegalDocument.CoachAgreement
          ? { role: Role.PROFESSIONAL }
          : {}),
      },
      select: {
        id: true,
        legalAcceptances: {
          where: { document },
          orderBy: { acceptedAt: 'desc' },
          take: 1,
          select: { version: true },
        },
      },
      take: BATCH,
    });
    const rows = candidates
      .filter((user) => {
        const latest = user.legalAcceptances[0]?.version;
        return latest !== undefined && isOlderVersion(latest, current.version);
      })
      .map((user) => ({
        kind: NotificationKind.LEGAL_UPDATE_NOTICE,
        sessionId: null,
        recipientId: user.id,
        dedupeSuffix: suffix,
        payload: {
          document,
          version: current.version,
          effectiveAt: current.effectiveAt,
          material: current.material ? 'yes' : 'no',
        },
      }));
    // Users already on the current version get a marker row so the sweep
    // stops re-reading them (skipped at dispatch).
    const upToDate = candidates
      .filter((user) => {
        const latest = user.legalAcceptances[0]?.version;
        return latest !== undefined && !isOlderVersion(latest, current.version);
      })
      .map((user) => ({
        kind: NotificationKind.LEGAL_UPDATE_NOTICE,
        sessionId: null,
        recipientId: user.id,
        dedupeSuffix: suffix,
        payload: { document, version: current.version, skip: 'up-to-date' },
      }));
    await this.notifications.enqueue(this.prisma, [...rows, ...upToDate]);
    if (rows.length > 0) {
      this.logger.log(
        `Queued ${rows.length} notices for ${document} ${current.version}`,
      );
    }
  }
}
