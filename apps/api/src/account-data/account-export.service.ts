import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ACCOUNT_ERROR_EXPORT_COOLDOWN,
  AccountDataRequestStatus as SharedStatus,
  ExportStatusResponse,
} from '@playwithpro/shared';
import {
  AccountDataRequest,
  AccountDataRequestKind,
  AccountDataRequestStatus,
  NotificationKind,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Readable } from 'node:stream';
import { buildZip } from './zip';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** How long a handed-out download link lives. */
const DOWNLOAD_URL_TTL_SECONDS = 10 * 60;

/** Pretty JSON that survives BigInt columns (video sizes). */
function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item: unknown) => (typeof item === 'bigint' ? Number(item) : item),
    2,
  );
}

/**
 * Portability: the user's data as JSON in a private zip. The inventory is
 * gathered from the tables the user is a party of (the counterpart only by
 * display name), media stay downloadable through the video endpoints. The
 * file is built by the job (best effort right after the request too),
 * announced by email, handed out through a short-lived pre-signed URL and
 * swept after its TTL.
 */
@Injectable()
export class AccountExportService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccountExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    void this.sweep();
  }

  async status(userId: string): Promise<ExportStatusResponse> {
    const latest = await this.prisma.accountDataRequest.findFirst({
      where: { userId, kind: AccountDataRequestKind.EXPORT },
      orderBy: { requestedAt: 'desc' },
    });
    const cooldown =
      this.config.getOrThrow<number>('ACCOUNT_EXPORT_COOLDOWN_HOURS') * HOUR;
    const nextAllowedAt = latest
      ? new Date(latest.requestedAt.getTime() + cooldown)
      : null;
    const ready =
      latest?.status === AccountDataRequestStatus.COMPLETED &&
      latest.exportKey !== null &&
      latest.exportExpiresAt !== null &&
      latest.exportExpiresAt.getTime() > Date.now();
    return {
      status: latest ? (latest.status.toLowerCase() as SharedStatus) : null,
      requestedAt: latest?.requestedAt.toISOString() ?? null,
      downloadUrl:
        ready && latest.exportKey
          ? await this.storage.presignGet(
              latest.exportKey,
              DOWNLOAD_URL_TTL_SECONDS,
              'playwithpro-export.zip',
            )
          : null,
      expiresAt: ready ? (latest.exportExpiresAt?.toISOString() ?? null) : null,
      nextAllowedAt:
        nextAllowedAt && nextAllowedAt.getTime() > Date.now()
          ? nextAllowedAt.toISOString()
          : null,
    };
  }

  async request(userId: string): Promise<ExportStatusResponse> {
    const current = await this.status(userId);
    if (current.nextAllowedAt) {
      throw new ConflictException({
        statusCode: 409,
        code: ACCOUNT_ERROR_EXPORT_COOLDOWN,
        message: 'An export was requested recently.',
        nextAllowedAt: current.nextAllowedAt,
      });
    }
    const request = await this.prisma.accountDataRequest.create({
      data: {
        userId,
        kind: AccountDataRequestKind.EXPORT,
        scheduledFor: new Date(),
      },
    });
    // Best effort now; the sweep picks it up otherwise.
    try {
      await this.build(request);
    } catch (error) {
      this.logger.warn(
        `Export ${request.id} deferred to the sweep: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return this.status(userId);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    try {
      await this.sweepOnce();
    } catch (error) {
      this.logger.error(
        'Account export sweep failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async sweepOnce(now = new Date()): Promise<void> {
    const pending = await this.prisma.accountDataRequest.findMany({
      where: {
        kind: AccountDataRequestKind.EXPORT,
        status: {
          in: [
            AccountDataRequestStatus.SCHEDULED,
            AccountDataRequestStatus.FAILED,
          ],
        },
      },
      take: 20,
    });
    for (const request of pending) {
      try {
        await this.build(request);
      } catch (error) {
        this.logger.error(
          `Export ${request.id} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    const expired = await this.prisma.accountDataRequest.findMany({
      where: {
        kind: AccountDataRequestKind.EXPORT,
        exportKey: { not: null },
        exportExpiresAt: { lte: now },
      },
      take: 50,
    });
    for (const request of expired) {
      if (request.exportKey) await this.storage.deleteObject(request.exportKey);
      await this.prisma.accountDataRequest.update({
        where: { id: request.id },
        data: { exportKey: null },
      });
    }
  }

  /** Gathers the inventory, writes the zip, announces it. */
  async build(request: AccountDataRequest): Promise<void> {
    const claimed = await this.prisma.accountDataRequest.updateMany({
      where: { id: request.id, status: request.status },
      data: { status: AccountDataRequestStatus.RUNNING },
    });
    if (claimed.count === 0) return;
    try {
      const { account, videos } = await this.inventory(request.userId);
      const zip = buildZip([
        { name: 'account.json', data: toJson(account) },
        { name: 'videos.json', data: toJson(videos) },
      ]);
      const key = `exports/${request.userId}/${request.id}.zip`;
      await this.storage.putObject(
        key,
        Readable.from(zip),
        'application/zip',
        zip.length,
      );
      const expiresAt = new Date(
        Date.now() +
          this.config.getOrThrow<number>('ACCOUNT_EXPORT_TTL_DAYS') * DAY,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.accountDataRequest.update({
          where: { id: request.id },
          data: {
            status: AccountDataRequestStatus.COMPLETED,
            completedAt: new Date(),
            exportKey: key,
            exportExpiresAt: expiresAt,
            lastError: null,
          },
        });
        await this.notifications.enqueue(tx, [
          {
            kind: NotificationKind.ACCOUNT_EXPORT_READY,
            sessionId: null,
            recipientId: request.userId,
            dedupeSuffix: request.id,
            payload: { expiresAt: expiresAt.toISOString() },
          },
        ]);
      });
      this.logger.log(`Export ${request.id} built for user ${request.userId}`);
    } catch (error) {
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

  /** Everything the user is a party of; the counterpart by display name only. */
  async inventory(
    userId: string,
  ): Promise<{ account: unknown; videos: unknown }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        playerProfile: true,
        proProfile: {
          include: {
            services: true,
            availabilityRules: true,
            availabilitySlots: { where: { status: { not: 'REMOVED' } } },
            verificationRequests: { include: { bookings: true } },
          },
        },
        legalAcceptances: true,
        oauthAccounts: { select: { provider: true } },
      },
    });
    const party = { OR: [{ playerId: userId }, { proProfile: { userId } }] };
    const sessions = await this.prisma.session.findMany({
      where: party,
      include: {
        player: { select: { displayName: true } },
        proProfile: { select: { user: { select: { displayName: true } } } },
        payments: true,
        dispute: true,
        review: true,
        attendance: { where: { userId } },
        reschedules: { include: { options: true } },
        videos: { include: { video: { select: { id: true, title: true } } } },
      },
      orderBy: { startsAt: 'asc' },
    });
    const videos = await this.prisma.video.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
    });
    const strip = <T extends object>(row: T, keys: string[]): Partial<T> =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => !keys.includes(key)),
      ) as Partial<T>;
    return {
      account: {
        exportedAt: new Date().toISOString(),
        account: strip(user, [
          'passwordHash',
          'playerProfile',
          'proProfile',
          'legalAcceptances',
          'oauthAccounts',
          'avatarKey',
        ]),
        linkedAccounts: user.oauthAccounts,
        playerProfile: user.playerProfile,
        coachProfile: user.proProfile
          ? {
              ...strip(user.proProfile, [
                'services',
                'availabilityRules',
                'availabilitySlots',
                'verificationRequests',
              ]),
              services: user.proProfile.services,
              availabilityRules: user.proProfile.availabilityRules,
              slots: user.proProfile.availabilitySlots,
              verification: user.proProfile.verificationRequests.map(
                (request) => ({
                  ...strip(request, ['adminNote', 'bookings']),
                  bookings: request.bookings.map((booking) =>
                    strip(booking, ['googleEventId', 'meetUrl']),
                  ),
                }),
              ),
            }
          : null,
        legalAcceptances: user.legalAcceptances,
        sessions: sessions.map((session) => ({
          ...strip(session, [
            'player',
            'proProfile',
            'payments',
            'dispute',
            'review',
            'attendance',
            'reschedules',
            'videos',
            'roomSlug',
          ]),
          role: session.playerId === userId ? 'player' : 'coach',
          counterpart:
            session.playerId === userId
              ? session.proProfile.user.displayName
              : session.player.displayName,
          payments: session.payments,
          dispute: session.dispute
            ? strip(session.dispute, ['adminNote', 'resolvedById'])
            : null,
          review: session.review,
          attendance: session.attendance,
          reschedules: session.reschedules,
          clips: session.videos.map((row) => ({
            videoId: row.video.id,
            title: row.video.title,
            note: row.note,
            position: row.position,
          })),
        })),
      },
      videos: videos.map((video) =>
        strip(video, ['originalKey', 'playbackKey', 's3UploadId']),
      ),
    };
  }
}
