import {
  CancellationPolicyMoments,
  CancellationRecord,
  CancellationTerms,
  CancellationTier as SharedCancellationTier,
  CancelledBy as SharedCancelledBy,
  PaymentStatus as SharedPaymentStatus,
  PlayerCardResponse,
  Role,
  SessionResponse,
  SessionStatus,
  SessionVideoItem,
} from '@playwithpro/shared';
import type {
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
import type { AttendanceRow } from '../session-rooms/attendance-classifier';
import {
  cancellationMoments,
  cancellationTerms,
  policyOf,
} from './cancellation-policy';
import {
  DISPUTE_SUMMARY_SELECT,
  DisputeSummaryRow,
  toAttendanceSummary,
  toDisputeSummary,
  toSharedGameAnswer,
} from './dispute.mapper';
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
  dispute: DisputeSummaryRow | null;
  attendance: AttendanceRow[];
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
  dispute: { select: DISPUTE_SUMMARY_SELECT },
  // Evidence rows feed the attendance summary; they never leave the API raw.
  attendance: {
    select: { userId: true, joinedAt: true, connectedAt: true, leftAt: true },
    orderBy: { joinedAt: 'asc' },
  },
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

/** Statuses in which what happened in the room is worth telling the parties. */
const ATTENDANCE_SUMMARY_STATUSES: string[] = [
  'AWAITING_CONFIRMATION',
  'COMPLETED_PAID',
  'DISPUTED',
  'RESOLVED',
];

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
    // A game pays out automatically only once the coach has answered.
    autoConfirmAt:
      session.status === 'AWAITING_CONFIRMATION' &&
      extras?.autoConfirmWindowHours !== undefined &&
      (online || session.coachConfirmedAt !== null)
        ? new Date(
            session.endsAt.getTime() +
              extras.autoConfirmWindowHours * 3_600_000,
          ).toISOString()
        : null,
    playerConfirmedAt: session.playerConfirmedAt?.toISOString() ?? null,
    coachConfirmedAt: session.coachConfirmedAt?.toISOString() ?? null,
    coachGameAnswer: toSharedGameAnswer(session.coachGameAnswer),
    attendance:
      online &&
      roomWindow !== undefined &&
      ATTENDANCE_SUMMARY_STATUSES.includes(session.status)
        ? toAttendanceSummary(
            session,
            session.proProfile.userId,
            session.attendance,
            roomWindow,
          )
        : null,
    escrow: escrow !== undefined ? ESCROW_STATUS[escrow] : null,
    cancellationPolicy: toCancellationPolicy(session),
    cancellationTerms: toCancellationTerms(session, extras?.viewer),
    cancellation: toCancellationRecord(session),
    dispute: session.dispute ? toDisputeSummary(session.dispute) : null,
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

type CancellableSession = Pick<
  SessionWithParties,
  | 'status'
  | 'startsAt'
  | 'paidAt'
  | 'priceMinor'
  | 'platformFeeMinor'
  | 'playerId'
  | 'cancelFreeHours'
  | 'cancelLateRefundPercent'
  | 'cancelNoRefundHours'
  | 'cancelGraceMin'
  | 'cancelledAt'
  | 'cancelledBy'
  | 'cancellationTier'
  | 'cancellationRefundMinor'
  | 'cancellationLate'
  | 'feeWaivedAt'
  | 'payments'
> & { proProfile: { userId: string } };

/**
 * The snapshotted terms as moments, while they can still matter: an unpaid
 * booking (previewed as if paid now — the checkout block) and a paid session
 * that has not started.
 */
export function toCancellationPolicy(
  session: CancellableSession,
  now = new Date(),
): CancellationPolicyMoments | null {
  const upcoming =
    (session.status === 'PENDING_PAYMENT' ||
      session.status === 'PAID_ESCROW') &&
    session.startsAt.getTime() > now.getTime();
  if (!upcoming) return null;
  const policy = policyOf(session);
  const moments = cancellationMoments(
    policy,
    session.startsAt,
    session.paidAt ?? now,
  );
  return {
    freeUntil: moments.freeUntil.toISOString(),
    partialUntil: moments.partialUntil.toISOString(),
    graceUntil: moments.graceUntil?.toISOString() ?? null,
    lateRefundPercent: policy.lateRefundPercent,
    graceMinutes: policy.graceMin,
  };
}

/** What cancelling now means for the party who is looking. */
export function toCancellationTerms(
  session: CancellableSession,
  viewer: AuthenticatedUser | undefined,
  now = new Date(),
): CancellationTerms | null {
  if (
    !viewer ||
    session.status !== 'PAID_ESCROW' ||
    session.startsAt.getTime() <= now.getTime()
  ) {
    return null;
  }
  const by =
    viewer.id === session.playerId
      ? 'player'
      : viewer.id === session.proProfile.userId
        ? 'coach'
        : null;
  if (by === null) return null;
  const terms = cancellationTerms({
    policy: policyOf(session),
    priceMinor: session.priceMinor,
    feeMinor: session.platformFeeMinor,
    startsAt: session.startsAt,
    paidAt: session.paidAt,
    by,
    now,
  });
  return {
    tier: terms.tier.toLowerCase() as SharedCancellationTier,
    refundMinor: terms.refundMinor,
    coachNetMinor: terms.coachNetMinor,
    late: terms.late,
  };
}

/** The cancellation record of a paid session; unpaid releases have none. */
export function toCancellationRecord(
  session: CancellableSession,
): CancellationRecord | null {
  if (
    session.status !== 'CANCELLED' ||
    session.cancelledAt === null ||
    session.cancelledBy === null ||
    session.cancellationTier === null
  ) {
    return null;
  }
  const refundMinor = session.cancellationRefundMinor ?? session.priceMinor;
  const retained = session.priceMinor - refundMinor;
  const coachFee =
    session.priceMinor === 0
      ? 0
      : Math.round((session.platformFeeMinor * retained) / session.priceMinor);
  const settled = session.payments[0]?.status !== PaymentStatus.HELD;
  return {
    by: session.cancelledBy.toLowerCase() as SharedCancelledBy,
    at: session.cancelledAt.toISOString(),
    tier: session.cancellationTier.toLowerCase() as SharedCancellationTier,
    refundMinor,
    coachNetMinor: retained - coachFee,
    late: session.cancellationLate,
    waived: session.feeWaivedAt !== null,
    settled,
    settlesAt: settled ? null : session.startsAt.toISOString(),
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
