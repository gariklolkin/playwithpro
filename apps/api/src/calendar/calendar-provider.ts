import type { ServiceType } from '@playwithpro/shared';
import type { SessionEmailFacts } from '../mailer/session-email-params';

export type { ServiceType };

/** One party of the session as an email recipient. */
export interface CalendarAttendee {
  email: string;
  displayName: string;
  locale: string;
  timezone: string;
  role: 'player' | 'coach';
}

/**
 * The session as the calendar sees it: snapshotted times, where it happens,
 * the facts the accompanying email mentions, and the event sequence
 * (0 for the invite, bumped by every update and by the cancellation).
 */
export interface CalendarSessionInput extends SessionEmailFacts {
  sequence: number;
}

/**
 * Port for calendar invitations. Business logic depends only on this
 * interface; the vendor behind it (.ics email in MVP, Google Calendar
 * candidate later) is an implementation detail. Each call addresses one
 * attendee in their own locale and timezone and THROWS on failure — the
 * notification outbox owns retries.
 */
export interface CalendarProvider {
  /** The invite (method REQUEST) with the role-specific email. */
  sendInvite(
    input: CalendarSessionInput,
    attendee: CalendarAttendee,
  ): Promise<void>;
  /** A time change: REQUEST for the same UID with a higher sequence. */
  sendUpdate(
    input: CalendarSessionInput,
    attendee: CalendarAttendee,
  ): Promise<void>;
  /** Revokes the event (method CANCEL, higher sequence) and says who cancelled. */
  sendCancellation(
    input: CalendarSessionInput,
    attendee: CalendarAttendee,
    cancelledBy: 'player' | 'coach',
  ): Promise<void>;
}

export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');
