import type { CancellationTier, CancelledBy } from "../enums/cancellation";

export const CANCELLATION_REASON_MAX_LENGTH = 500;

/** The platform's current policy; sessions snapshot it at booking. */
export interface CancellationPolicy {
  /** Full refund when the player cancels at least this long before start. */
  freeHours: number;
  /** Share of the price refunded between the two boundaries. */
  lateRefundPercent: number;
  /** No refund when the player cancels later than this before start. */
  noRefundHours: number;
  /** Free cancellation after paying for a booking made inside the free window. */
  graceMinutes: number;
}

/** A session's snapshotted terms as concrete moments (ISO, UTC). */
export interface CancellationPolicyMoments {
  freeUntil: string;
  partialUntil: string;
  /** End of the late-booking grace; null when it does not apply. */
  graceUntil: string | null;
  lateRefundPercent: number;
  graceMinutes: number;
}

/** What cancelling right now would mean, for the viewer's role. */
export interface CancellationTerms {
  tier: CancellationTier;
  /** Returned to the player, minor units. */
  refundMinor: number;
  /** What the coach receives after the proportional platform fee. */
  coachNetMinor: number;
  /** The coach cancelling inside the free window: recorded as late. */
  late: boolean;
}

/** How a paid session was cancelled. */
export interface CancellationRecord {
  by: CancelledBy;
  at: string;
  tier: CancellationTier;
  /** Returned to the player (the full price after a waiver). */
  refundMinor: number;
  /** What the coach receives; 0 for a full refund. */
  coachNetMinor: number;
  late: boolean;
  /** The late fee was waived: the player is refunded in full. */
  waived: boolean;
  /** The payment has moved; false while a late cancellation awaits the start time. */
  settled: boolean;
  /** When a held late cancellation settles (the original start); null once settled or for a full refund. */
  settlesAt: string | null;
}

/** Body of the admin's force-majeure cancellation. */
export interface AdminCancelSessionRequest {
  reason: string;
}
