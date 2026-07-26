import type { DisputeOutcome } from "../enums/dispute";
import type { PaymentStatus } from "../enums/payment";
import type { PlayerLevel } from "../enums/player-profile";
import type { ProProfileStatus } from "../enums/pro-profile";
import type { Role } from "../enums/role";
import type { ServiceType } from "../enums/service-type";
import type { SessionStatus } from "../enums/session-status";
import type { RatingAggregate } from "./review";

export const ADMIN_USERS_PAGE_SIZE = 20;
export const ADMIN_PAYMENTS_PAGE_SIZE = 20;
export const ADMIN_REVIEWS_PAGE_SIZE = 20;
/** Days covered by the analytics daily trend. */
export const ADMIN_ANALYTICS_TREND_DAYS = 30;
export const MODERATION_REASON_MAX_LENGTH = 2000;

/** One row of the admin user directory. */
export interface AdminUserListItem {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
  /** Null while the account is active. */
  suspendedAt: string | null;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Session counters keyed by session status; absent statuses mean zero. */
export type AdminSessionCounts = Partial<Record<SessionStatus, number>>;

export interface AdminUserDetail extends AdminUserListItem {
  locale: string;
  timezone: string;
  playerProfile: { level: PlayerLevel } | null;
  proProfile: {
    status: ProProfileStatus;
    rating: RatingAggregate;
  } | null;
  /** Sessions the user took part in (as player or as coach). */
  sessionCounts: AdminSessionCounts;
  /** Payment attempts across the user's sessions (both sides). */
  paymentAttempts: number;
}

/** One row of the admin payment ledger — the raw audit trail entry. */
export interface AdminPaymentItem {
  id: string;
  sessionId: string;
  serviceType: ServiceType;
  playerDisplayName: string;
  coachDisplayName: string;
  provider: string;
  providerRef: string | null;
  amountMinor: number;
  currency: string;
  feeMinor: number;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPaymentListResponse {
  items: AdminPaymentItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Money totals for one currency; amounts in integer minor units. */
export interface AdminCurrencyTotals {
  currency: string;
  heldMinor: number;
  releasedMinor: number;
  refundedMinor: number;
  /** Sum of fee snapshots over released payments. */
  feeRevenueMinor: number;
}

export interface AdminTrendPoint {
  /** UTC calendar date, YYYY-MM-DD. */
  date: string;
  sessionsCreated: number;
  released: { currency: string; amountMinor: number }[];
}

export interface AdminAnalyticsResponse {
  users: {
    byRole: Record<Role, number>;
    suspended: number;
    total: number;
  };
  sessions: AdminSessionCounts;
  disputes: {
    open: number;
    resolved: Record<DisputeOutcome, number>;
  };
  money: AdminCurrencyTotals[];
  trend: AdminTrendPoint[];
}

/** One row of the admin review moderation list. */
export interface AdminReviewItem {
  id: string;
  sessionId: string;
  proProfileId: string;
  rating: number;
  text: string | null;
  coachDisplayName: string;
  playerDisplayName: string;
  createdAt: string;
}

export interface AdminReviewListResponse {
  items: AdminReviewItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DeleteReviewRequest {
  /** Moderation reason; required, logged server-side. */
  reason: string;
}
