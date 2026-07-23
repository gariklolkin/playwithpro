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
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import {
  ROOM_ACCESS_STATUSES,
  isOnlineService,
} from '../bookings/session-access';
import { SessionProgressionService } from '../bookings/session-progression.service';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { PrismaService } from '../prisma/prisma.service';
import type { VideoProvider } from './video-provider';
import { VIDEO_PROVIDER } from './video-provider';

const MINUTE = 60_000;

const ROOM_INCLUDE = {
  player: { select: { id: true, displayName: true } },
  proProfile: {
    select: { userId: true, user: { select: { displayName: true } } },
  },
  video: { select: { id: true, title: true } },
} as const;

type RoomSession = Prisma.SessionGetPayload<{ include: typeof ROOM_INCLUDE }>;

@Injectable()
export class SessionRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly progression: SessionProgressionService,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
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
      // The descriptor carries the room slug — the capability — so it is
      // released only inside the join window.
      room:
        joinable && session.roomSlug !== null
          ? this.video.getRoom({ roomSlug: session.roomSlug })
          : null,
      videoId: session.video?.id ?? null,
      videoTitle: session.video?.title ?? null,
      counterpartName: viewerIsPlayer
        ? session.proProfile.user.displayName
        : session.player.displayName,
    };
  }

  async join(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<JoinRoomResponse> {
    const session = await this.requireRoomSession(user, sessionId);
    const now = Date.now();
    const { opensAt, closesAt } = this.window(session);
    if (now < opensAt.getTime() || now > closesAt.getTime()) {
      throw new ConflictException('The session room is closed.');
    }
    const attendance = await this.prisma.sessionAttendance.create({
      data: { sessionId: session.id, userId: user.id },
    });
    return { attendanceId: attendance.id };
  }

  /** Best-effort: beacons on tab close may never arrive, joinedAt suffices. */
  async leave(
    user: AuthenticatedUser,
    sessionId: string,
    attendanceId: string,
  ): Promise<void> {
    await this.prisma.sessionAttendance.updateMany({
      where: { id: attendanceId, sessionId, userId: user.id, leftAt: null },
      data: { leftAt: new Date() },
    });
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
