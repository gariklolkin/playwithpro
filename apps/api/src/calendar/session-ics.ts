/**
 * Minimal RFC 5545 builder for session invites. VEVENT surface is tiny, so a
 * hand-rolled template beats a dependency; the verification-call ics.ts stays
 * separate because its UID/summary scheme predates sessions.
 */
export interface SessionIcsInput {
  sessionId: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  /** Room URL or venue address; becomes LOCATION (and URL when a link). */
  location: string;
  locationIsUrl: boolean;
  description: string;
  organizerEmail: string;
  attendeeEmails: string[];
  method: 'REQUEST' | 'CANCEL';
  /** 0 for the invite; bumped for the cancellation of the same UID. */
  sequence: number;
}

export function sessionUid(sessionId: string): string {
  return `session-${sessionId}@playwithpro`;
}

export function buildSessionIcs(input: SessionIcsInput): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PlayWithPro//Sessions//EN',
    `METHOD:${input.method}`,
    'BEGIN:VEVENT',
    `UID:${sessionUid(input.sessionId)}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(input.startsAt)}`,
    `DTEND:${toIcsUtc(input.endsAt)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    `DESCRIPTION:${escapeText(input.description)}`,
    `LOCATION:${escapeText(input.location)}`,
    ...(input.locationIsUrl ? [`URL:${input.location}`] : []),
    `ORGANIZER;CN=PlayWithPro:mailto:${input.organizerEmail}`,
    ...input.attendeeEmails.map(
      (email) =>
        `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${email}`,
    ),
    input.method === 'CANCEL' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function toIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** RFC 5545 3.3.11: escape backslash, semicolon, comma, and newlines. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
