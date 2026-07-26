import {
  DisputeOutcome as SharedDisputeOutcome,
  DisputeStatus as SharedDisputeStatus,
  PaymentStatus as SharedPaymentStatus,
  SessionResponse,
  SessionStatus,
} from '@playwithpro/shared';
import type {
  Dispute,
  Payment,
  ProProfile,
  Review,
  Session,
  User,
  Video,
} from '@prisma/client';
import { PaymentStatus } from '@prisma/client';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { ROOM_ACCESS_STATUSES, isOnlineService } from './session-access';

export type SessionWithParties = Session & {
  player: Pick<User, 'id' | 'displayName' | 'avatarKey'>;
  proProfile: ProProfile & {
    user: Pick<User, 'displayName' | 'avatarKey'>;
    services: Array<{ venueLabel: string }>;
  };
  video: Pick<Video, 'id' | 'title'> | null;
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

export const SESSION_INCLUDE = {
  player: { select: { id: true, displayName: true, avatarKey: true } },
  proProfile: {
    include: {
      user: { select: { displayName: true, avatarKey: true } },
      // Venue lives on the coach's game service; only game sessions render it.
      services: { where: { type: 'GAME' }, select: { venueLabel: true } },
    },
  },
  video: { select: { id: true, title: true } },
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
    videoId: session.video?.id ?? null,
    videoTitle: session.video?.title ?? null,
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
