import type {
  AttendanceOutcome,
  DisputeKind,
  DisputeOutcome,
  DisputeReasonCategory,
  DisputeResolvedVia,
  DisputeStatus,
  DisputeSystemNote,
} from "../enums/dispute";
import type { ServiceType } from "../enums/service-type";

export const DISPUTE_REASON_MAX_LENGTH = 2000;
export const COACH_RESPONSE_MIN_LENGTH = 20;
export const COACH_RESPONSE_MAX_LENGTH = 2000;

export interface OpenDisputeRequest {
  category: DisputeReasonCategory;
  /** Free text; required only for the "other" category. */
  reason?: string;
}

/** The coach's single statement on a system-opened dispute. */
export interface DisputeResponseRequest {
  statement: string;
}

/**
 * What the attendance evidence says about an online session — never the raw
 * rows. Times and overlap are computed from the current entries; `outcome`
 * is the frozen decision (null until the join window has closed).
 */
export interface AttendanceSummary {
  playerFirstConnectedAt: string | null;
  coachFirstConnectedAt: string | null;
  /** Whole minutes both parties were connected at the same time. */
  overlapMinutes: number;
  /** Minutes the coach connected after the start; 0 when on time or absent. */
  coachLateMinutes: number;
  /** Coach > 10 min late, or overlap under half of the scheduled duration. */
  partial: boolean;
  outcome: AttendanceOutcome | null;
}

/** The session's dispute as its two parties see it. */
export interface DisputeSummary {
  status: DisputeStatus;
  kind: DisputeKind;
  /** Player-reported disputes only. */
  reasonCategory: DisputeReasonCategory | null;
  reason: string | null;
  outcome: DisputeOutcome | null;
  /** Automatic refund deadline; null when none is pending. */
  responseDueAt: string | null;
  coachResponse: string | null;
  coachRespondedAt: string | null;
  resolvedVia: DisputeResolvedVia | null;
  systemNote: DisputeSystemNote | null;
}

export interface ResolveDisputeRequest {
  outcome: DisputeOutcome;
  note?: string;
}

/** Room join/leave evidence shown to the resolving admin. */
export interface DisputeAttendanceEntry {
  userId: string;
  displayName: string;
  /** When the party performed the join action (token issued). */
  joinedAt: string;
  /** When the media server saw them connect; null if they never connected. */
  connectedAt: string | null;
  /** When the media server saw them leave; null if unknown. */
  leftAt: string | null;
}

export interface AdminDisputeItem {
  id: string;
  sessionId: string;
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  kind: DisputeKind;
  reasonCategory: DisputeReasonCategory | null;
  reason: string | null;
  adminNote: string | null;
  responseDueAt: string | null;
  coachResponse: string | null;
  coachRespondedAt: string | null;
  resolvedVia: DisputeResolvedVia | null;
  systemNote: DisputeSystemNote | null;
  /** Computed attendance summary; null for in-person games. */
  attendanceSummary: AttendanceSummary | null;
  /** The coach's earlier COACH_NO_SHOW disputes that ended in a refund. */
  coachPreviousNoShows: number;
  openedAt: string;
  resolvedAt: string | null;
  serviceType: ServiceType;
  startsAt: string;
  endsAt: string;
  /** Escrowed amount in minor units with its ISO 4217 currency. */
  amountMinor: number;
  currency: string;
  /** Platform fee withheld from the coach payout on release. */
  feeMinor: number;
  player: { id: string; displayName: string };
  coach: { id: string; displayName: string };
  attendance: DisputeAttendanceEntry[];
}

export interface AdminDisputeListResponse {
  open: AdminDisputeItem[];
  resolved: AdminDisputeItem[];
}
