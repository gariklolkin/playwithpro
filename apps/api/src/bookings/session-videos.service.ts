import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SessionVideoInput,
  SessionVideosRejection,
} from '@playwithpro/shared';
import { ServiceType, SessionStatus, VideoStatus } from '@prisma/client';
import type { Prisma, Video } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UnattachedVideosService } from '../videos/unattached-videos.service';

/** A clip set that passed validation, in the player's order. */
export interface ValidatedClip {
  video: Video;
  note: string | null;
}

/** Statuses in which the player may still change the clip set (before start). */
const EDITABLE_STATUSES: SessionStatus[] = [
  SessionStatus.PENDING_PAYMENT,
  SessionStatus.PAID_ESCROW,
];

const REJECTION_MESSAGES: Record<SessionVideosRejection['reason'], string> = {
  empty: 'A video-analysis booking requires at least one clip.',
  duplicate: 'The same clip is listed twice.',
  not_ready: 'A clip is not ready yet.',
  too_many_clips: 'Too many clips for one session.',
  too_long: 'The clips are too long in total for one session.',
};

/**
 * The per-session clip set: validation against the platform caps (count and
 * total duration — deliberately unrelated to the session length or price),
 * the rows written at booking, and the atomic replace until the session starts.
 */
@Injectable()
export class SessionVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly unattached: UnattachedVideosService,
  ) {}

  caps(): { maxClips: number; maxTotalSeconds: number } {
    return {
      maxClips: this.config.getOrThrow<number>('SESSION_VIDEO_MAX_COUNT'),
      maxTotalSeconds:
        this.config.getOrThrow<number>('SESSION_VIDEO_MAX_TOTAL_MIN') * 60,
    };
  }

  /**
   * Every clip must be the player's own ready video, listed once, within the
   * caps. Foreign or unknown ids are a 404 (no existence oracle); rule
   * violations are 400s with a machine-readable reason.
   */
  async validate(
    playerId: string,
    inputs: SessionVideoInput[],
  ): Promise<ValidatedClip[]> {
    if (inputs.length === 0) reject({ reason: 'empty' });
    const ids = inputs.map((input) => input.videoId);
    if (new Set(ids).size !== ids.length) reject({ reason: 'duplicate' });
    const { maxClips, maxTotalSeconds } = this.caps();
    if (ids.length > maxClips) {
      reject({ reason: 'too_many_clips', max: maxClips, count: ids.length });
    }
    const videos = await this.prisma.video.findMany({
      where: { id: { in: ids }, ownerId: playerId },
    });
    if (videos.length !== ids.length) {
      throw new NotFoundException();
    }
    if (videos.some((video) => video.status !== VideoStatus.READY)) {
      reject({ reason: 'not_ready' });
    }
    const totalSeconds = videos.reduce(
      (sum, video) => sum + (video.durationSeconds ?? 0),
      0,
    );
    if (totalSeconds > maxTotalSeconds) {
      reject({ reason: 'too_long', maxSeconds: maxTotalSeconds, totalSeconds });
    }
    const byId = new Map(videos.map((video) => [video.id, video]));
    return inputs.map((input) => ({
      video: byId.get(input.videoId) as Video,
      note: normalizeNote(input.note),
    }));
  }

  /** Rows for a nested create at booking time, positions 0..n-1. */
  rowsFor(
    clips: ValidatedClip[],
  ): Prisma.SessionVideoCreateWithoutSessionInput[] {
    return clips.map((clip, position) => ({
      position,
      note: clip.note,
      video: { connect: { id: clip.video.id } },
    }));
  }

  /**
   * Atomic replace of the clip set by the player, allowed while the session
   * is unpaid or paid and has not started. Kept clips keep their `addedAt`;
   * the price and escrow are untouched.
   */
  async replace(
    playerId: string,
    sessionId: string,
    inputs: SessionVideoInput[],
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { playerId: true, serviceType: true },
    });
    if (!session || session.playerId !== playerId) {
      throw new NotFoundException();
    }
    if (session.serviceType !== ServiceType.VIDEO_ANALYSIS) {
      throw new ConflictException('Only video-analysis sessions carry clips.');
    }
    const clips = await this.validate(playerId, inputs);
    const touched = await this.prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: the progression sweep may have
      // started the session since the pre-check.
      const current = await tx.session.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          status: true,
          startsAt: true,
          videos: { select: { videoId: true, addedAt: true } },
        },
      });
      if (
        !EDITABLE_STATUSES.includes(current.status) ||
        current.startsAt.getTime() <= Date.now()
      ) {
        throw new ConflictException(
          'The clips of this session can no longer be changed.',
        );
      }
      const addedAtOf = new Map(
        current.videos.map((row) => [row.videoId, row.addedAt]),
      );
      await tx.sessionVideo.deleteMany({ where: { sessionId } });
      await tx.sessionVideo.createMany({
        data: clips.map((clip, position) => ({
          sessionId,
          videoId: clip.video.id,
          position,
          note: clip.note,
          addedAt: addedAtOf.get(clip.video.id) ?? new Date(),
        })),
      });
      return [
        ...current.videos.map((row) => row.videoId),
        ...clips.map((clip) => clip.video.id),
      ];
    });
    await this.unattached.recompute(touched);
  }
}

function reject(rejection: SessionVideosRejection): never {
  throw new BadRequestException({
    statusCode: 400,
    message: REJECTION_MESSAGES[rejection.reason],
    ...rejection,
  });
}

function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
