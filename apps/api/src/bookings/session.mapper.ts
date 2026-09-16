import {
  DisputeOutcome as SharedDisputeOutcome,
  DisputeStatus as SharedDisputeStatus,
  PaymentStatus as SharedPaymentStatus,
  PlayerCardResponse,
  Role,
  SessionResponse,
  SessionStatus,
  SessionVideoItem,
} from '@playwithpro/shared';
import type {
  Dispute,
  Payment,
  PlayerProfile,
  ProProfile,
  Review,
  Session,
  User,
  Video,
} from '@prisma/client';
import { PaymentStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { toPlayerCard } from '../players/player-profile.mapper';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import {
  COACH_ACCESS_STATUSES,
  ROOM_ACCESS_STATUSES,
  isOnlineService,
} from './session-access';

export type SessionWithParties = Session & {
  player: Pick<User, 'id' | 'displayName' | 'avatarKey'> & {
    playerProfile: PlayerProfile | null;
  };
  proProfile: ProProfile & {
    user: Pick<User, 'displayName' | 'avatarKey'>;
    services: Array<{ venueLabel: string }>;
  };
  videos: Array<{
    position: number;
    note: string | null;
    video: Pick<
      Video,
      'id' | 'title' | 'durationSeconds' | 'fps' | 'width' | 'height'
    >;
  }>;
  payments: Array<Pick<Payment, 'status'>>;
  dispute: Pick<Dispute, 'status' | 'reason' | 'outcome'> | null;
  review: Pick<Review, 'rating' | 'text' | 'createdAt'> | null;
};

/** The escrow lifecycle: failed attempts never enter it. */
const SETTLED_OR_HELD: PaymentStatus[] = [
  PaymentStatus.HELD,
  PaymentStatus.RELEASED,
  PaymentStatus.REFUNDED,
];

/** The clip fields both parties see (the room needs frame rate and size). */
export const SESSION_VIDEO_SELECT = {
  id: true,
  title: true,
  durationSeconds: true,
  fps: true,
  width: true,
  height: true,
} as const;

export const SESSION_INCLUDE = {
  // The profile rides along for the coach's "About the player" card; the
  // mapper decides per viewer whether it leaves the API.
  player: {
    select: {
      id: true,
      displayName: true,
      avatarKey: true,
      playerProfile: true,
    },
  },
  proProfile: {
    include: {
      user: { select: { displayName: true, avatarKey: true } },
      // Venue lives on the coach's game service; only game sessions render it.
      services: { where: { type: 'GAME' }, select: { venueLabel: true } },
    },
  },
  videos: {
    select: {
      position: true,
      note: true,
      video: { select: SESSION_VIDEO_SELECT },
    },
    orderBy: { position: 'asc' },
  },
  // The escrow state: at most one payment ever leaves HELD, so one row is
  // the whole story; failed attempts stay out of it.
  payments: {
    where: { status: { in: SETTLED_OR_HELD } },
    select: { status: true },
    take: 1,
  },
  dispute: { select: { status: true, reason: true, outcome: true } },
  review: { select: { rating: true, text: true, createdAt: true } },
} as const;

/** Join-window bounds around the slot, in minutes. */
export interface RoomWindow {
  beforeMin: number;
  afterMin: number;
}

export interface SessionResponseExtras {
  /** Present when the caller wants the room join window exposed. */
  roomWindow?: RoomWindow;
  /** Present when the caller wants the auto-confirm deadline exposed. */
  autoConfirmWindowHours?: number;
  /** The reader; decides whether the player's card is embedded. Absent = player-only data. */
  viewer?: AuthenticatedUser;
}

/**
 * The player-profiles rule: a coach sees the player's card only through a
 * shared session that is paid (never pending, never cancelled). Every other
 * reader — the player, admins, callers without a viewer — gets null.
 */
export function toPlayerContext(
  session: {
    status: SessionWithParties['status'];
    player: SessionWithParties['player'];
    proProfile: { userId: string };
  },
  viewer: AuthenticatedUser | undefined,
  avatarUrlOf: (key: string) => string,
): PlayerCardResponse | null {
  if (
    !viewer ||
    viewer.role !== Role.Professional ||
    session.proProfile.userId !== viewer.id ||
    !COACH_ACCESS_STATUSES.includes(session.status)
  ) {
    return null;
  }
  return toPlayerCard(
    session.player,
    session.player.playerProfile,
    avatarUrlOf,
  );
}

const ESCROW_STATUS: Record<string, SharedPaymentStatus> = {
  [PaymentStatus.HELD]: SharedPaymentStatus.Held,
  [PaymentStatus.RELEASED]: SharedPaymentStatus.Released,
  [PaymentStatus.REFUNDED]: SharedPaymentStatus.Refunded,
};

export function toSessionResponse(
  session: SessionWithParties,
  avatarUrlOf: (key: string) => string,
  extras?: SessionResponseExtras,
): SessionResponse {
  const avatar = (key: string | null) =>
    key === null ? null : avatarUrlOf(key);
  const online = isOnlineService(session.serviceType);
  const roomWindow = extras?.roomWindow;
  const hasRoom =
    online &&
    roomWindow !== undefined &&
    session.roomSlug !== null &&
    ROOM_ACCESS_STATUSES.includes(session.status);
  const escrow = session.payments[0]?.status;
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
    videos: toSessionVideoItems(session.videos),
    goal: session.goal ?? null,
    playerContext: toPlayerContext(session, extras?.viewer, avatarUrlOf),
    venue: online ? null : (session.proProfile.services[0]?.venueLabel ?? null),
    room: hasRoom
      ? {
          opensAt: new Date(
            session.startsAt.getTime() - roomWindow.beforeMin * 60_000,
          ).toISOString(),
          closesAt: new Date(
            session.endsAt.getTime() + roomWindow.afterMin * 60_000,
          ).toISOString(),
        }
      : null,
    autoConfirmAt:
      session.status === 'AWAITING_CONFIRMATION' &&
      extras?.autoConfirmWindowHours !== undefined
        ? new Date(
            session.endsAt.getTime() +
              extras.autoConfirmWindowHours * 3_600_000,
          ).toISOString()
        : null,
    playerConfirmedAt: session.playerConfirmedAt?.toISOString() ?? null,
    coachConfirmedAt: session.coachConfirmedAt?.toISOString() ?? null,
    escrow: escrow !== undefined ? ESCROW_STATUS[escrow] : null,
    dispute: session.dispute
      ? {
          status:
            session.dispute.status === 'OPEN'
              ? SharedDisputeStatus.Open
              : SharedDisputeStatus.Resolved,
          reason: session.dispute.reason,
          outcome:
            session.dispute.outcome === 'RELEASE'
              ? SharedDisputeOutcome.Release
              : session.dispute.outcome === 'REFUND'
                ? SharedDisputeOutcome.Refund
                : null,
        }
      : null,
    review: session.review
      ? {
          rating: session.review.rating,
          text: session.review.text,
          createdAt: session.review.createdAt.toISOString(),
        }
      : null,
    reviewable: session.review === null && isPaidOut(session),
    createdAt: session.createdAt.toISOString(),
  };
}

/** Clip rows (already ordered by position) → the party-facing shape. */
export function toSessionVideoItems(
  rows: SessionWithParties['videos'],
): SessionVideoItem[] {
  return rows.map((row) => ({
    videoId: row.video.id,
    title: row.video.title,
    note: row.note,
    durationSeconds: row.video.durationSeconds,
    fps: row.video.fps,
    width: row.video.width,
    height: row.video.height,
    position: row.position,
  }));
}

/**
 * The coach was paid for this session: completed, or a dispute the admin
 * resolved in the coach's favor. Deliberately independent of the payment
 * row, which may lag HELD while a payout retry is pending.
 */
function isPaidOut(
  session: Pick<SessionWithParties, 'status' | 'dispute'>,
): boolean {
  return (
    session.status === 'COMPLETED_PAID' ||
    (session.status === 'RESOLVED' && session.dispute?.outcome === 'RELEASE')
  );
}
