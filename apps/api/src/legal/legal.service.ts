import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LEGAL_ERROR_REACCEPTANCE_REQUIRED,
  LEGAL_ERROR_VERSION_OUTDATED,
  LegalAcceptanceContext as SharedContext,
  LegalDocument,
  LegalStatusItem,
  LegalStatusResponse,
  PlatformFacts,
  currentLegalVersion,
  findLegalVersion,
  isOlderVersion,
  latestMaterialVersion,
  requiredLegalDocuments,
} from '@playwithpro/shared';
import {
  LegalAcceptanceContext,
  Prisma,
  ProProfileStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Either the service's client or the caller's transaction. */
type Db = PrismaService | Prisma.TransactionClient;

export interface AcceptedVersion {
  document: LegalDocument;
  version: string;
}

/**
 * Acceptance evidence and the re-acceptance rule. Rows are append-only: a
 * user's standing on a document is their latest row, and it is stale when a
 * material version is newer — or when there is no row at all (nobody is
 * bound by terms they never accepted; seeds and test users accept
 * explicitly). The documents and versions come from the shared registry.
 */
@Injectable()
export class LegalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The versions a client claims to have shown must be the current ones;
   * anything else means a stale page — the client re-renders with the new
   * links and asks again.
   */
  assertCurrent(accepted: AcceptedVersion[]): void {
    for (const { document, version } of accepted) {
      if (currentLegalVersion(document).version !== version) {
        throw new BadRequestException({
          statusCode: 400,
          code: LEGAL_ERROR_VERSION_OUTDATED,
          message: `The ${document} version ${version} is not the current one.`,
          documents: [
            { document, version: currentLegalVersion(document).version },
          ],
        });
      }
    }
  }

  /** Writes the rows; inside the caller's transaction when given one. */
  async record(
    db: Db,
    input: {
      userId: string;
      accepted: AcceptedVersion[];
      locale: string;
      context: SharedContext;
      sessionId?: string;
    },
  ): Promise<void> {
    if (input.accepted.length === 0) return;
    await db.legalAcceptance.createMany({
      data: input.accepted.map(({ document, version }) => ({
        userId: input.userId,
        document,
        version,
        locale: input.locale,
        context: input.context.toUpperCase() as LegalAcceptanceContext,
        sessionId: input.sessionId ?? null,
      })),
    });
  }

  /** What the signed-in user still has to accept, and what is merely new. */
  async status(userId: string): Promise<LegalStatusResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: true,
        proProfile: { select: { status: true } },
      },
    });
    const required = requiredLegalDocuments({
      professional: user.role === Role.PROFESSIONAL,
      verificationSubmitted:
        user.proProfile !== null &&
        user.proProfile.status !== ProProfileStatus.DRAFT,
    });
    const latest = await this.latestAccepted(userId, required);
    const stale: LegalStatusItem[] = [];
    const notices: LegalStatusItem[] = [];
    for (const document of required) {
      const current = currentLegalVersion(document);
      const acceptedVersion = latest.get(document) ?? null;
      const item: LegalStatusItem = {
        document,
        version: current.version,
        effectiveAt: current.effectiveAt,
        acceptedVersion,
      };
      const material = latestMaterialVersion(document);
      if (
        acceptedVersion === null ||
        (material !== null && isOlderVersion(acceptedVersion, material.version))
      ) {
        stale.push(item);
      } else if (isOlderVersion(acceptedVersion, current.version)) {
        notices.push(item);
      }
    }
    return { stale, notices };
  }

  /** The gate: throws the stable conflict when something is stale. */
  async assertAccepted(userId: string): Promise<void> {
    const { stale } = await this.status(userId);
    if (stale.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: LEGAL_ERROR_REACCEPTANCE_REQUIRED,
        message: 'Please accept the current terms to continue.',
        documents: stale.map(({ document, version }) => ({
          document,
          version,
        })),
      });
    }
  }

  /** Re-acceptance from the interstitial: current versions only. */
  async accept(
    userId: string,
    accepted: AcceptedVersion[],
    locale: string,
  ): Promise<LegalStatusResponse> {
    for (const { document, version } of accepted) {
      if (!findLegalVersion(document, version)) {
        throw new BadRequestException(`Unknown version of ${document}.`);
      }
    }
    this.assertCurrent(accepted);
    await this.record(this.prisma, {
      userId,
      accepted,
      locale,
      context: SharedContext.Reaccept,
    });
    return this.status(userId);
  }

  /** The numbers the legal texts reference; never hard-coded in the text. */
  facts(): PlatformFacts {
    const n = (name: string) => this.config.getOrThrow<number>(name);
    const s = (name: string) => this.config.getOrThrow<string>(name);
    return {
      operatorName: s('OPERATOR_NAME'),
      operatorAddress: s('OPERATOR_ADDRESS'),
      supportEmail: s('SUPPORT_EMAIL'),
      feePercent: n('PLATFORM_FEE_PERCENT'),
      cancellationFreeHours: n('CANCELLATION_FREE_HOURS'),
      cancellationLateRefundPercent: n('CANCELLATION_LATE_REFUND_PERCENT'),
      cancellationNoRefundHours: n('CANCELLATION_NO_REFUND_HOURS'),
      cancellationGraceMinutes: n('CANCELLATION_GRACE_MIN'),
      autoConfirmHours: n('AUTO_CONFIRM_WINDOW_HOURS'),
      noShowResponseHours: n('NO_SHOW_RESPONSE_WINDOW_HOURS'),
      unattachedVideoRetentionDays: n('VIDEO_UNATTACHED_RETENTION_DAYS'),
      rescheduleMaxPerSession: n('RESCHEDULE_MAX_PER_SESSION'),
    };
  }

  private async latestAccepted(
    userId: string,
    documents: LegalDocument[],
  ): Promise<Map<LegalDocument, string>> {
    const rows = await this.prisma.legalAcceptance.findMany({
      where: { userId, document: { in: documents } },
      orderBy: { acceptedAt: 'desc' },
      select: { document: true, version: true },
    });
    const latest = new Map<LegalDocument, string>();
    for (const row of rows) {
      const document = row.document as LegalDocument;
      // Newest first; a later row with an older version never wins.
      const known = latest.get(document);
      if (known === undefined || isOlderVersion(known, row.version)) {
        latest.set(document, row.version);
      }
    }
    return latest;
  }
}
