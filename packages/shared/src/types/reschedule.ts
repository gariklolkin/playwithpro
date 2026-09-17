/** Lifecycle of a reschedule proposal. */
export enum RescheduleStatus {
  Open = "open",
  Accepted = "accepted",
  Declined = "declined",
  Withdrawn = "withdrawn",
  Expired = "expired",
  /** Closed because the session was cancelled or started. */
  Superseded = "superseded",
}

/** A proposal offers between one and this many of the coach's open slots. */
export const RESCHEDULE_MAX_OPTIONS = 3;
/** Proposals and offered slots must be at least this far from now. */
export const RESCHEDULE_MIN_NOTICE_HOURS = 2;

export interface RescheduleOption {
  id: string;
  startsAt: string;
  endsAt: string;
}

/** The session's open proposal, as its two parties see it. */
export interface RescheduleProposal {
  id: string;
  proposedBy: "player" | "coach";
  /** The viewer made this proposal: they may withdraw, the other side answers. */
  mine: boolean;
  options: RescheduleOption[];
  expiresAt: string;
  /** The session's time when the proposal was made. */
  fromStartsAt: string;
}

export interface ProposeRescheduleRequest {
  /** 1–3 open slots of the session's coach, same duration as the booked one. */
  slotIds: string[];
}

export interface AcceptRescheduleRequest {
  optionId: string;
}

/** One line of a session's reschedule history (admin ledger). */
export interface AdminRescheduleEntry {
  proposedBy: "player" | "coach";
  status: RescheduleStatus;
  fromStartsAt: string;
  /** The accepted new start; null unless accepted. */
  toStartsAt: string | null;
  createdAt: string;
  respondedAt: string | null;
}
