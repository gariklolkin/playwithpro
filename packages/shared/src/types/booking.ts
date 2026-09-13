import type { DisputeOutcome, DisputeStatus } from "../enums/dispute";
import type { PaymentStatus } from "../enums/payment";
import type { ServiceType } from "../enums/service-type";
import type { SessionStatus } from "../enums/session-status";
import type { ReviewResponse } from "./review";

/** Player's hint to the coach about a clip ("serve", "forehand loop"). */
export const SESSION_VIDEO_NOTE_MAX_LENGTH = 80;

/** One clip in the order the player wants it reviewed. */
export interface SessionVideoInput {
  videoId: string;
  note?: string | null;
}

/** A clip attached to a session, as both parties see it. */
export interface SessionVideoItem {
  videoId: string;
  title: string;
  note: string | null;
  durationSeconds: number | null;
  /** Probed average frame rate; null when unknown. */
  fps: number | null;
  /** Probed frame size in pixels; null when unknown. */
  width: number | null;
  height: number | null;
  /** 0-based order; gaps after a library delete are possible. */
  position: number;
}

/**
 * Why a clip set was refused, with the numbers the UI needs to localize the
 * message. Sent as the body of a 400 alongside `statusCode`/`message`.
 */
export type SessionVideosRejection =
  | { reason: "empty" }
  | { reason: "duplicate" }
  | { reason: "not_ready" }
  | { reason: "too_many_clips"; max: number; count: number }
  | { reason: "too_long"; maxSeconds: number; totalSeconds: number };

export interface CreateBookingRequest {
  /** ProProfile id of the coach. */
  proId: string;
  serviceType: ServiceType;
  slotId: string;
  /** Required (non-empty) for video_analysis, forbidden otherwise. */
  videos?: SessionVideoInput[];
}

/** Replaces a session's clip set; player only, until the session starts. */
export interface UpdateSessionVideosRequest {
  videos: SessionVideoInput[];
}

export interface PaySessionRequest {
  /** Opaque payment-instrument token; omitted = mock success. */
  instrument?: string;
}

export interface SessionParty {
  /** User id for the player, ProProfile id for the coach. */
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SessionResponse {
  id: string;
  status: SessionStatus;
  serviceType: ServiceType;
  /** Snapshotted at booking; later coach edits never change it. */
  priceMinor: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  /** Payment deadline while pending_payment; null once paid. */
  expiresAt: string | null;
  coach: SessionParty;
  player: SessionParty;
  /** Attached clips in order (video_analysis only; empty otherwise or after deletes). */
  videos: SessionVideoItem[];
  /** Venue of the coach's game service; set for game sessions only. */
  venue: string | null;
  /** Session-room join window; set for paid online sessions, null otherwise. */
  room: { opensAt: string; closesAt: string } | null;
  /**
   * Deadline after which an unconfirmed, undisputed session auto-completes
   * and pays out; set while awaiting_confirmation, null otherwise.
   */
  autoConfirmAt: string | null;
  playerConfirmedAt: string | null;
  coachConfirmedAt: string | null;
  /** State of the escrowed payment (held/released/refunded); null before a successful hold. */
  escrow: PaymentStatus | null;
  /** The session's dispute, visible to its parties; null when none. */
  dispute: {
    status: DisputeStatus;
    reason: string;
    outcome: DisputeOutcome | null;
  } | null;
  /** The player's review of this session; null when none yet. */
  review: ReviewResponse | null;
  /** True when the viewer-independent eligibility holds: paid-out terminal status and no review yet. */
  reviewable: boolean;
  createdAt: string;
}

export interface SessionListResponse {
  upcoming: SessionResponse[];
  past: SessionResponse[];
}

/** Outcome of a pay attempt that did not throw. */
export interface PaySessionResponse {
  session: SessionResponse;
  paymentStatus: PaymentStatus;
  /** Set when the hold was declined; localized client-side. */
  declineReason: string | null;
}
