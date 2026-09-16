import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JoinRoomResponse,
  Role,
  SessionRoomResponse,
  SessionStatus as SharedSessionStatus,
} from '@playwithpro/shared';
import { ServiceType, type Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import {
  ROOM_ACCESS_STATUSES,
  isOnlineService,
} from '../bookings/session-access';
import { SessionProgressionService } from '../bookings/session-progression.service';
import {
  SESSION_VIDEO_SELECT,
  toPlayerContext,
  toSessionVideoItems,
} from '../bookings/session.mapper';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { VideoProvider } from './video-provider';
import { VIDEO_PROVIDER } from './video-provider';

const MINUTE = 60_000;

const ROOM_INCLUDE = {
  player: {
    select: {
      id: true,
      displayName: true,
      avatarKey: true,
      playerProfile: true,
    },
  },
  proProfile: {
    select: { userId: true, user: { select: { displayName: true } } },
  },
  videos: {
    select: {
      position: true,
      note: true,
      video: { select: SESSION_VIDEO_SELECT },
    },
    orderBy: { position: 'asc' },
  },
} as const;

type RoomSession = Prisma.SessionGetPayload<{ include: typeof ROOM_INCLUDE }>;

@Injectable()
export class SessionRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly progression: SessionProgressionService,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
    private readonly storage: StorageService,
  ) {}

  async getRoom(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SessionRoomResponse> {
    const session = await this.requireRoomSession(user, sessionId);
    const now = Date.now();
    const { opensAt, closesAt } = this.window(session);
    const joinable = now >= opensAt.getTime() && now <= closesAt.getTime();
    const viewerIsPlayer = session.playerId === user.id;
    return {
      sessionId: session.id,
      status: session.status.toLowerCase() as SharedSessionStatus,
      serviceType: toSharedServiceType(session.serviceType),
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
      // Room details are released only inside the join window; admission
      // still needs the participant token minted by join().
      room:
        joinable && session.roomSlug !== null
          ? this.video.describeRoom({ roomSlug: session.roomSlug })
          : null,
      videos: toSessionVideoItems(session.videos),
      counterpartName: viewerIsPlayer
        ? session.proProfile.user.displayName
        : session.player.displayName,
      goal: session.goal ?? null,
      // Same rule as the session lists: the coach, paid statuses only.
      playerContext: toPlayerContext(session, user, (key) =>
        this.storage.avatarUrl(key),
      ),
      // Same instant as the join-window check, so the countdown the client
      // derives from it can never disagree with the joinable decision.
      serverNow: new Date(now).toISOString(),
    };
  }

  /**
   * Explicit join: records the attendance row (the evidence that the party
   * tried) and mints the participant token. Parties only — admins may read
   * timing via getRoom() but never enter the call.
   */
  async join(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<JoinRoomResponse> {
    const session = await this.requireRoomSession(user, sessionId);
    const viewerIsPlayer = session.playerId === user.id;
    const viewerIsCoach = session.proProfile.userId === user.id;
    if (!viewerIsPlayer && !viewerIsCoach) {
      throw new NotFoundException();
    }
    const now = Date.now();
    const { opensAt, closesAt } = this.window(session);
    if (now < opensAt.getTime() || now > closesAt.getTime()) {
      throw new ConflictException('The session room is closed.');
    }
    if (session.roomSlug === null) {
      throw new ConflictException('This session has no active room.');
    }
    const token = await this.video.issueToken({
      roomSlug: session.roomSlug,
      participant: {
        id: user.id,
        displayName: viewerIsPlayer
          ? session.player.displayName
          : session.proProfile.user.displayName,
        role: viewerIsPlayer ? 'player' : 'coach',
      },
    });
    const attendance = await this.prisma.sessionAttendance.create({
      data: { sessionId: session.id, userId: user.id },
    });
    return { attendanceId: attendance.id, token };
  }

  /**
   * Gate for the playback sync channel: strictly the two parties (no admin
   * pass-through — the channel is peer state, not oversight), video-analysis
   * only, room-eligible status, inside the join window. Throws otherwise.
   */
  async authorizePlaybackSync(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: ROOM_INCLUDE,
    });
    const isParty =
      session &&
      (session.playerId === user.id || session.proProfile.userId === user.id);
    if (
      !session ||
      !isParty ||
      session.serviceType !== ServiceType.VIDEO_ANALYSIS
    ) {
      throw new NotFoundException();
    }
    const current = await this.progression.normalize(session);
    if (!ROOM_ACCESS_STATUSES.includes(current.status)) {
      throw new ConflictException('This session has no active room.');
    }
    const now = Date.now();
    const { opensAt, closesAt } = this.window(current);
    if (now < opensAt.getTime() || now > closesAt.getTime()) {
      throw new ConflictException('The session room is closed.');
    }
  }

  /** Ids of the clips currently attached; the sync channel accepts only these. */
  async attachedVideoIds(sessionId: string): Promise<string[]> {
    const rows = await this.prisma.sessionVideo.findMany({
      where: { sessionId },
      select: { videoId: true },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => row.videoId);
  }

  /**
   * Party-gated, online-only, paid-status session with progression applied.
   * Game sessions have no room at all, so they 404 like non-parties do.
   */
  private async requireRoomSession(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<RoomSession> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: ROOM_INCLUDE,
    });
    const isParty =
      session &&
      (session.playerId === user.id ||
        session.proProfile.userId === user.id ||
        user.role === Role.Admin);
    if (!session || !isParty || !isOnlineService(session.serviceType)) {
      throw new NotFoundException();
    }
    const current = await this.progression.normalize(session);
    if (!ROOM_ACCESS_STATUSES.includes(current.status)) {
      throw new ConflictException('This session has no active room.');
    }
    return current;
  }

  private window(session: { startsAt: Date; endsAt: Date }): {
    opensAt: Date;
    closesAt: Date;
  } {
    const beforeMin = this.config.getOrThrow<number>(
      'ROOM_JOIN_WINDOW_BEFORE_MIN',
    );
    const afterMin = this.config.getOrThrow<number>(
      'ROOM_JOIN_WINDOW_AFTER_MIN',
    );
    return {
      opensAt: new Date(session.startsAt.getTime() - beforeMin * MINUTE),
      closesAt: new Date(session.endsAt.getTime() + afterMin * MINUTE),
    };
  }
}
