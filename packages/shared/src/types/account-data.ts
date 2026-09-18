import type { ServiceType } from "../enums/service-type";
import type { SessionStatus } from "../enums/session-status";

export enum AccountDataRequestKind {
  Deletion = "deletion",
  Export = "export",
}

export enum AccountDataRequestStatus {
  Scheduled = "scheduled",
  Running = "running",
  Postponed = "postponed",
  Completed = "completed",
  Cancelled = "cancelled",
  Failed = "failed",
}

/** Stable error codes of the account-data flows. */
export const ACCOUNT_ERROR_DELETION_BLOCKED = "account_deletion_blocked";
export const ACCOUNT_ERROR_DELETION_PENDING = "account_deletion_pending";
export const ACCOUNT_ERROR_EXPORT_COOLDOWN = "account_export_cooldown";
export const ACCOUNT_ERROR_REAUTH_REQUIRED = "account_reauth_required";

/** The word a user types to confirm a deletion (client-side UX only). */
export const ACCOUNT_DELETION_CONFIRMATION_WORD = "DELETE";
export const ACCOUNT_DELETION_REASON_MAX_LENGTH = 500;

/** Something that must be settled before an account can be deleted. */
export type DeletionBlocker =
  | {
      kind: "session";
      sessionId: string;
      status: SessionStatus;
      serviceType: ServiceType;
      startsAt: string;
      /** The user's side of that session. */
      role: "player" | "coach";
    }
  | { kind: "held_payment"; sessionId: string; amountMinor: number; currency: string };

/** What the signed-in user sees about their deletion. */
export interface DeletionStatusResponse {
  /** Null when no deletion is scheduled. */
  scheduledFor: string | null;
  /** Postponed since the original request (a blocker appeared). */
  postponed: boolean;
  blockers: DeletionBlocker[];
  /** Password accounts re-authenticate with it; the others with an emailed code. */
  reauth: "password" | "code";
  graceDays: number;
}

export interface RequestDeletionRequest {
  password?: string;
  code?: string;
}

/** The last export request of the signed-in user. */
export interface ExportStatusResponse {
  status: AccountDataRequestStatus | null;
  requestedAt: string | null;
  /** Short-lived pre-signed URL while the file exists and is ready. */
  downloadUrl: string | null;
  expiresAt: string | null;
  /** When another export may be requested. */
  nextAllowedAt: string | null;
}

export interface AdminDeleteUserRequest {
  reason: string;
  /** 0 = execute on the next job tick; default = platform grace. */
  graceDays?: number;
}

export interface AccountRequestStep {
  status: "done" | "failed" | "skipped";
  at: string;
  error?: string;
}

/** One row of the admin request log. */
export interface AdminAccountRequestItem {
  id: string;
  userId: string;
  kind: AccountDataRequestKind;
  status: AccountDataRequestStatus;
  initiatedBy: "self" | "admin";
  adminId: string | null;
  reason: string | null;
  requestedAt: string;
  scheduledFor: string;
  cancelledAt: string | null;
  completedAt: string | null;
  postponedAt: string | null;
  steps: Record<string, AccountRequestStep>;
  lastError: string | null;
}
