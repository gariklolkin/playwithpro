import type { LegalAcceptanceContext, LegalDocument } from "../legal/registry";

/** Stable error codes of the legal flows (HTTP 400/409 bodies carry them). */
export const LEGAL_ERROR_VERSION_OUTDATED = "legal_version_outdated";
export const LEGAL_ERROR_REACCEPTANCE_REQUIRED = "legal_reacceptance_required";

/** One document the signed-in user must accept, or is only told about. */
export interface LegalStatusItem {
  document: LegalDocument;
  /** The current version to accept. */
  version: string;
  effectiveAt: string;
  /** The user's latest accepted version; null when never accepted. */
  acceptedVersion: string | null;
}

export interface LegalStatusResponse {
  /** Material updates (or never accepted): blocking until accepted. */
  stale: LegalStatusItem[];
  /** Newer, non-material versions: a dismissible notice. */
  notices: LegalStatusItem[];
}

/** Body of the re-acceptance action: the versions the user saw. */
export interface AcceptLegalRequest {
  accepted: Array<{ document: LegalDocument; version: string }>;
}

/** Values the legal texts reference through `{{tokens}}`; never hard-coded. */
export interface PlatformFacts {
  operatorName: string;
  operatorAddress: string;
  supportEmail: string;
  feePercent: number;
  cancellationFreeHours: number;
  cancellationLateRefundPercent: number;
  cancellationNoRefundHours: number;
  cancellationGraceMinutes: number;
  autoConfirmHours: number;
  noShowResponseHours: number;
  unattachedVideoRetentionDays: number;
  rescheduleMaxPerSession: number;
}

/** An acceptance row as shown to admins. */
export interface LegalAcceptanceEntry {
  document: LegalDocument;
  version: string;
  locale: string;
  context: LegalAcceptanceContext;
  sessionId: string | null;
  acceptedAt: string;
}
