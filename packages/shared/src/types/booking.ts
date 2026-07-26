import type { DisputeOutcome, DisputeStatus } from "../enums/dispute";
import type { PaymentStatus } from "../enums/payment";
import type { ServiceType } from "../enums/service-type";
import type { SessionStatus } from "../enums/session-status";

export interface CreateBookingRequest {
  /** ProProfile id of the coach. */
  proId: string;
  serviceType: ServiceType;
  slotId: string;
  /** Required for video_analysis, forbidden otherwise. */
  videoId?: string;
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
  /** Attached video (video_analysis only). */
  videoId: string | null;
  videoTitle: string | null;
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
