/** Lifecycle of a verification request (the "case"). */
export enum VerificationState {
  AwaitingScheduling = "awaiting_scheduling",
  Scheduled = "scheduled",
  InProgress = "in_progress",
  Verified = "verified",
  Rejected = "rejected",
  Cancelled = "cancelled",
}

/** Outcome of a single booking attempt; the audit trail behind the case. */
export enum BookingStatus {
  Scheduled = "scheduled",
  Completed = "completed",
  Rescheduled = "rescheduled",
  NoShow = "no_show",
  CancelledByPro = "cancelled_by_pro",
  CancelledByAdmin = "cancelled_by_admin",
}

/** Calendar-provider sync state; the marketplace DB stays the source of truth. */
export enum MeetingSyncStatus {
  Pending = "pending",
  Synced = "synced",
  Failed = "failed",
}

/** A no-show this many times auto-cancels the request. */
export const MAX_NO_SHOWS = 2;

/** Coaches cannot book a slot starting sooner than this. */
export const BOOKING_MIN_NOTICE_HOURS = 2;

/** Reschedule/cancel are locked this close to the meeting. */
export const RESCHEDULE_CUTOFF_HOURS = 1;
