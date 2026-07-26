import type { DisputeOutcome, DisputeStatus } from "../enums/dispute";
import type { ServiceType } from "../enums/service-type";

export interface OpenDisputeRequest {
  /** Why the player is contesting the session; required. */
  reason: string;
}

export interface ResolveDisputeRequest {
  outcome: DisputeOutcome;
  note?: string;
}

/** Room join/leave evidence shown to the resolving admin. */
export interface DisputeAttendanceEntry {
  userId: string;
  displayName: string;
  joinedAt: string;
  /** Best-effort; null when the tab-close beacon never arrived. */
  leftAt: string | null;
}

export interface AdminDisputeItem {
  id: string;
  sessionId: string;
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  reason: string;
  adminNote: string | null;
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
