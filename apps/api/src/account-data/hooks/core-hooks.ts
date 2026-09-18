import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountDataRequestKind,
  SlotStatus,
  VerificationState,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../../scheduling/scheduling.service';
import { StorageService } from '../../storage/storage.service';
import { VideosService } from '../../videos/videos.service';
import {
  AccountErasureHook,
  ErasureOutcome,
  done,
  skipped,
} from '../erasure-hook';

/** Credentials and access: tokens, Google link, pending codes. */
@Injectable()
export class CredentialsErasureHook implements AccountErasureHook {
  readonly name = 'credentials';
  constructor(private readonly prisma: PrismaService) {}
  async erase(userId: string): Promise<ErasureOutcome> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.verificationToken.deleteMany({ where: { userId } }),
      this.prisma.oAuthAccount.deleteMany({ where: { userId } }),
    ]);
    return done;
  }
}

/** The player card: pure personal profile. */
@Injectable()
export class PlayerProfileErasureHook implements AccountErasureHook {
  readonly name = 'player-profile';
  constructor(private readonly prisma: PrismaService) {}
  async erase(userId: string): Promise<ErasureOutcome> {
    await this.prisma.playerProfile.deleteMany({ where: { userId } });
    return done;
  }
}

/**
 * The coach profile row stays (sessions reference it, it holds the rating
 * aggregate) but its personal content and services go; catalog visibility
 * is already gone through the tombstone filters.
 */
@Injectable()
export class ProProfileErasureHook implements AccountErasureHook {
  readonly name = 'pro-profile';
  constructor(private readonly prisma: PrismaService) {}
  async erase(userId: string): Promise<ErasureOutcome> {
    const profile = await this.prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return skipped('no coach profile');
    await this.prisma.$transaction([
      this.prisma.proService.deleteMany({ where: { profileId: profile.id } }),
      this.prisma.proProfile.update({
        where: { id: profile.id },
        data: { bio: '', languages: [] },
      }),
    ]);
    return done;
  }
}

/** Rules gone, open future slots removed; booked and past slots are history. */
@Injectable()
export class AvailabilityErasureHook implements AccountErasureHook {
  readonly name = 'availability';
  constructor(private readonly prisma: PrismaService) {}
  async erase(userId: string): Promise<ErasureOutcome> {
    const profile = await this.prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return skipped('no coach profile');
    await withdrawAvailability(this.prisma, profile.id);
    return done;
  }
}

/** Shared with the request path: the coach leaves the market immediately. */
export async function withdrawAvailability(
  prisma: PrismaService,
  profileId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { profileId } }),
    prisma.availabilitySlot.updateMany({
      where: {
        profileId,
        status: SlotStatus.OPEN,
        startsAt: { gt: new Date() },
      },
      data: { status: SlotStatus.REMOVED },
    }),
  ]);
}

/** An open verification withdrawn as the coach would, admin notes cleared. */
@Injectable()
export class VerificationErasureHook implements AccountErasureHook {
  readonly name = 'verification';
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingService,
  ) {}
  async erase(userId: string): Promise<ErasureOutcome> {
    const profile = await this.prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return skipped('no coach profile');
    await withdrawOpenVerification(this.prisma, this.scheduling, userId);
    await this.prisma.verificationRequest.updateMany({
      where: { profileId: profile.id },
      data: { adminNote: '' },
    });
    return done;
  }
}

/**
 * Shared by the request path and the hook: an open verification request is
 * withdrawn through the coach's own path (booking cancelled, slot reopened,
 * calendar event deleted, admins notified); nothing to do otherwise.
 */
export async function withdrawOpenVerification(
  prisma: PrismaService,
  scheduling: SchedulingService,
  userId: string,
): Promise<void> {
  const open = await prisma.verificationRequest.count({
    where: {
      profile: { userId },
      state: {
        in: [
          VerificationState.AWAITING_SCHEDULING,
          VerificationState.SCHEDULED,
        ],
      },
    },
  });
  if (open > 0) await scheduling.withdraw(userId);
}

/** Every video: objects and rows (attachment rows cascade). */
@Injectable()
export class VideosErasureHook implements AccountErasureHook {
  readonly name = 'videos';
  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
  ) {}
  async erase(userId: string): Promise<ErasureOutcome> {
    const rows = await this.prisma.video.findMany({
      where: { ownerId: userId },
    });
    for (const video of rows) {
      await this.videos.purge(video);
    }
    return done;
  }
}

/** The whole avatar prefix, orphans from abandoned uploads included. */
@Injectable()
export class AvatarsErasureHook implements AccountErasureHook {
  readonly name = 'avatars';
  constructor(private readonly storage: StorageService) {}
  async erase(userId: string): Promise<ErasureOutcome> {
    await this.storage.deletePrefix(`avatars/${userId}/`);
    return done;
  }
}

/**
 * Export zips hold the whole inventory: they go with the account instead of
 * waiting for their own TTL.
 */
@Injectable()
export class ExportsErasureHook implements AccountErasureHook {
  readonly name = 'exports';
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}
  async erase(userId: string): Promise<ErasureOutcome> {
    await this.storage.deletePrefix(`exports/${userId}/`);
    await this.prisma.accountDataRequest.updateMany({
      where: { userId, kind: AccountDataRequestKind.EXPORT },
      data: { exportKey: null, exportExpiresAt: null },
    });
    return done;
  }
}

/**
 * PostHog person and its events/replays, through the persons API — only
 * with a personal API key; otherwise recorded as skipped so the operator
 * knows what was not erased.
 */
@Injectable()
export class ObservabilityErasureHook implements AccountErasureHook {
  readonly name = 'observability';
  constructor(private readonly config: ConfigService) {}
  async erase(userId: string): Promise<ErasureOutcome> {
    const key = this.config.get<string>('POSTHOG_PERSONAL_API_KEY');
    const project = this.config.get<string>('POSTHOG_PROJECT_ID');
    if (!this.config.get<string>('POSTHOG_API_KEY')) {
      return skipped('analytics disabled');
    }
    if (!key || !project) {
      return skipped('no PostHog personal API key / project id');
    }
    const host = (this.config.get<string>('POSTHOG_HOST') ?? '')
      .replace('://eu.i.', '://eu.')
      .replace('://us.i.', '://us.');
    const headers = { Authorization: `Bearer ${key}` };
    const found = await fetch(
      `${host}/api/projects/${project}/persons/?distinct_id=${encodeURIComponent(userId)}`,
      { headers },
    );
    if (!found.ok) throw new Error(`PostHog persons lookup ${found.status}`);
    const body = (await found.json()) as { results?: Array<{ id: string }> };
    for (const person of body.results ?? []) {
      const deleted = await fetch(
        `${host}/api/projects/${project}/persons/${person.id}/?delete_events=true`,
        { method: 'DELETE', headers },
      );
      if (!deleted.ok && deleted.status !== 404) {
        throw new Error(`PostHog person delete ${deleted.status}`);
      }
    }
    return done;
  }
}
