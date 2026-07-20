/** Weekly recurring availability window in the coach's wall-clock time. */
export interface AvailabilityRuleInput {
  /** 0 = Monday … 6 = Sunday (ISO). */
  weekday: number;
  /** Minutes from local midnight; multiple of 30. */
  startMinute: number;
  /** Exclusive end; at least 60 minutes after start. */
  endMinute: number;
}

export interface AvailabilityRuleResponse extends AvailabilityRuleInput {
  id: string;
}

export type AvailabilitySlotStatus = "open" | "booked";
export type AvailabilitySlotOrigin = "rule" | "manual";

/** Concrete 60-minute coach slot; instants are UTC ISO strings. */
export interface AvailabilitySlotItem {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AvailabilitySlotStatus;
  source: AvailabilitySlotOrigin;
}

export interface CoachAvailabilityResponse {
  /** IANA timezone the weekly template is anchored to (the coach's account timezone). */
  timezone: string;
  rules: AvailabilityRuleResponse[];
  /** Non-removed future slots over the materialized horizon. */
  slots: AvailabilitySlotItem[];
}

/** Full replacement of the weekly template. */
export interface ReplaceAvailabilityRulesRequest {
  rules: AvailabilityRuleInput[];
}

export interface CreateManualSlotRequest {
  /** UTC ISO instant aligned to :00/:30. */
  startsAt: string;
}

/** Open slot of a verified coach as served to the public catalog/booking. */
export interface PublicAvailabilitySlot {
  id: string;
  startsAt: string;
  endsAt: string;
}
