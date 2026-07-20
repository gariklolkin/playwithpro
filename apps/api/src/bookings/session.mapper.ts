import { SessionResponse, SessionStatus } from '@playwithpro/shared';
import type { ProProfile, Session, User, Video } from '@prisma/client';
import { toSharedServiceType } from '../pros/pro-profile.mapper';

export type SessionWithParties = Session & {
  player: Pick<User, 'id' | 'displayName' | 'avatarKey'>;
  proProfile: ProProfile & {
    user: Pick<User, 'displayName' | 'avatarKey'>;
  };
  video: Pick<Video, 'id' | 'title'> | null;
};

export const SESSION_INCLUDE = {
  player: { select: { id: true, displayName: true, avatarKey: true } },
  proProfile: {
    include: { user: { select: { displayName: true, avatarKey: true } } },
  },
  video: { select: { id: true, title: true } },
} as const;

export function toSessionResponse(
  session: SessionWithParties,
  avatarUrlOf: (key: string) => string,
): SessionResponse {
  const avatar = (key: string | null) =>
    key === null ? null : avatarUrlOf(key);
  return {
    id: session.id,
    status: session.status.toLowerCase() as SessionStatus,
    serviceType: toSharedServiceType(session.serviceType),
    priceMinor: session.priceMinor,
    currency: session.currency,
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    expiresAt: session.expiresAt?.toISOString() ?? null,
    coach: {
      id: session.proProfile.id,
      displayName: session.proProfile.user.displayName,
      avatarUrl: avatar(session.proProfile.user.avatarKey),
    },
    player: {
      id: session.player.id,
      displayName: session.player.displayName,
      avatarUrl: avatar(session.player.avatarKey),
    },
    videoId: session.video?.id ?? null,
    videoTitle: session.video?.title ?? null,
    createdAt: session.createdAt.toISOString(),
  };
}
