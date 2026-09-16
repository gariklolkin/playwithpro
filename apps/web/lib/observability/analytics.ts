"use client";

import { captureEvent } from "./client";

/**
 * Named booking-funnel events emitted by the browser (consent-gated by
 * construction: the client is started only after consent). Money and
 * lifecycle events (`session_paid`, `session_completed`, …) come from the
 * API as the source of truth and are never emitted here.
 */
export const FUNNEL_EVENTS = {
  catalogViewed: "catalog_viewed",
  coachViewed: "coach_viewed",
  slotSelected: "slot_selected",
  checkoutViewed: "checkout_viewed",
  roomJoined: "room_joined",
  sessionConfirmed: "session_confirmed",
  disputeSubmitted: "dispute_submitted",
  bookingCancelled: "booking_cancelled",
} as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

export type EventProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export function track(event: FunnelEvent, properties?: EventProperties): void {
  captureEvent(event, properties);
}
