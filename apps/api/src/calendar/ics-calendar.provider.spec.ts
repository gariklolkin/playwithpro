import { ConfigService } from '@nestjs/config';
import { MailerService } from '../mailer/mailer.service';
import type { CalendarSessionInput } from './calendar-provider';
import { IcsCalendarProvider } from './ics-calendar.provider';
import { buildSessionIcs, sessionUid } from './session-ics';

const input: CalendarSessionInput = {
  sessionId: 'session-1',
  startsAt: new Date('2026-08-01T10:00:00Z'),
  endsAt: new Date('2026-08-01T11:00:00Z'),
  serviceLabel: 'consultation',
  roomUrl: 'http://localhost:3000/sessions/session-1/room',
  venue: null,
  attendees: [
    { email: 'player@example.com', displayName: 'Player' },
    { email: 'coach@example.com', displayName: 'Coach' },
  ],
};

describe('buildSessionIcs', () => {
  it('emits a REQUEST event with UTC times, stable UID, and the room URL', () => {
    const ics = buildSessionIcs({
      sessionId: 'session-1',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      summary: 'PlayWithPro consultation session',
      location: input.roomUrl as string,
      locationIsUrl: true,
      description: `Join the session room: ${input.roomUrl}`,
      organizerEmail: 'no-reply@playwithpro.local',
      attendeeEmails: ['player@example.com', 'coach@example.com'],
      method: 'REQUEST',
      sequence: 0,
    });

    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain(`UID:${sessionUid('session-1')}`);
    expect(ics).toContain('DTSTART:20260801T100000Z');
    expect(ics).toContain('DTEND:20260801T110000Z');
    expect(ics).toContain('SEQUENCE:0');
    expect(ics).toContain('URL:http://localhost:3000/sessions/session-1/room');
    expect(ics).toContain(
      'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:coach@example.com',
    );
    expect(ics).toContain('STATUS:CONFIRMED');
  });

  it('escapes commas and semicolons in venue locations', () => {
    const ics = buildSessionIcs({
      sessionId: 'session-1',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      summary: 'PlayWithPro game session',
      location: 'TT Club; Hall 2, Berlin',
      locationIsUrl: false,
      description: 'Meet at the venue',
      organizerEmail: 'no-reply@playwithpro.local',
      attendeeEmails: ['player@example.com'],
      method: 'REQUEST',
      sequence: 0,
    });

    expect(ics).toContain('LOCATION:TT Club\\; Hall 2\\, Berlin');
  });
});

describe('IcsCalendarProvider', () => {
  const mailer = {
    sendSessionInviteEmail: jest.fn<Promise<void>, [unknown]>(),
    sendSessionCancelledEmail: jest.fn<Promise<void>, [unknown]>(),
  };
  const config = {
    getOrThrow: () => 'PlayWithPro <no-reply@playwithpro.local>',
  } as unknown as ConfigService;
  const provider = new IcsCalendarProvider(
    mailer as unknown as MailerService,
    config,
  );

  beforeEach(() => jest.clearAllMocks());

  it('emails a REQUEST invite to every attendee', async () => {
    await provider.sendInvite(input);

    expect(mailer.sendSessionInviteEmail).toHaveBeenCalledTimes(2);
    const call = mailer.sendSessionInviteEmail.mock.calls[0][0] as {
      to: string;
      ics: string;
      roomUrl: string | null;
    };
    expect(call.to).toBe('player@example.com');
    expect(call.roomUrl).toBe(input.roomUrl);
    expect(call.ics).toContain('METHOD:REQUEST');
    expect(call.ics).toContain(`UID:${sessionUid('session-1')}`);
  });

  it('emails a CANCEL update with a bumped sequence and the same UID', async () => {
    await provider.sendCancellation(input);

    expect(mailer.sendSessionCancelledEmail).toHaveBeenCalledTimes(2);
    const call = mailer.sendSessionCancelledEmail.mock.calls[0][0] as {
      ics: string;
    };
    expect(call.ics).toContain('METHOD:CANCEL');
    expect(call.ics).toContain('SEQUENCE:1');
    expect(call.ics).toContain('STATUS:CANCELLED');
    expect(call.ics).toContain(`UID:${sessionUid('session-1')}`);
  });

  it('uses the venue as location for game sessions', async () => {
    await provider.sendInvite({
      ...input,
      roomUrl: null,
      venue: 'TT Club Berlin',
    });

    const call = mailer.sendSessionInviteEmail.mock.calls[0][0] as {
      ics: string;
      venue: string | null;
    };
    expect(call.venue).toBe('TT Club Berlin');
    expect(call.ics).toContain('LOCATION:TT Club Berlin');
    expect(call.ics).not.toContain('URL:');
  });
});
