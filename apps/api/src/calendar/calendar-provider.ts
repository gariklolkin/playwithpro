/**
 * Port for calendar invitations. Business logic depends only on this
 * interface; the vendor behind it (.ics email in MVP, Google Calendar
 * candidate later) is an implementation detail.
 */
export interface CalendarSessionInput {
  /** Stable calendar UID source; one event per session, ever. */
  sessionId: string;
  /** Snapshotted session times (UTC). */
  startsAt: Date;
  endsAt: Date;
  /** English service label used in the event summary. */
  serviceLabel: string;
  /** Platform session-room URL for online services, null for in-person game. */
  roomUrl: string | null;
  /** Venue address for game sessions, null for online services. */
  venue: string | null;
  attendees: Array<{ email: string; displayName: string }>;
}

export interface CalendarProvider {
  /** Invite both parties; failures must be swallowed and logged, never thrown. */
  sendInvite(input: CalendarSessionInput): Promise<void>;
  /** Revoke a previously sent event (same UID); called only after an invite. */
  sendCancellation(input: CalendarSessionInput): Promise<void>;
}

export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');
