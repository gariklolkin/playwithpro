/** Minimal iCalendar invite so non-Google coaches get a native calendar entry. */
export function buildVerificationCallIcs(input: {
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  meetUrl: string | null;
  organizerEmail: string;
  attendeeEmail: string;
  manageUrl: string;
}): string {
  const description = input.meetUrl
    ? `Join the meeting: ${input.meetUrl}\\nManage the booking: ${input.manageUrl}`
    : `The meeting link is on your verification page: ${input.manageUrl}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PlayWithPro//Verification//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:verification-${input.bookingId}@playwithpro`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(input.startsAt)}`,
    `DTEND:${toIcsUtc(input.endsAt)}`,
    'SUMMARY:PlayWithPro verification call',
    `DESCRIPTION:${description}`,
    ...(input.meetUrl
      ? [`LOCATION:${input.meetUrl}`, `URL:${input.meetUrl}`]
      : []),
    `ORGANIZER;CN=PlayWithPro:mailto:${input.organizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${input.attendeeEmail}`,
    'STATUS:CONFIRMED',
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
