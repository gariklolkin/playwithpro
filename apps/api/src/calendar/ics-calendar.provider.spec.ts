import type { ConfigService } from '@nestjs/config';
import { ServiceType } from '@playwithpro/shared';
import { EmailRenderer } from '../mailer/email-renderer';
import type { MailerService, OutgoingMail } from '../mailer/mailer.service';
import type {
  CalendarAttendee,
  CalendarSessionInput,
} from './calendar-provider';
import { IcsCalendarProvider } from './ics-calendar.provider';
import { buildSessionIcs, sessionUid } from './session-ics';

const config = {
  get: (name: string) => ({ WEB_APP_URL: 'http://localhost:3000' })[name],
  getOrThrow: (name: string) =>
    ({ SMTP_FROM: 'PlayWithPro <no-reply@playwithpro.local>' })[name],
} as unknown as ConfigService;

const ROOM_URL = 'http://localhost:3000/en/sessions/session-1/room';

const input: CalendarSessionInput = {
  sessionId: 'session-1',
  serviceType: ServiceType.Consultation,
  startsAt: new Date('2026-08-01T10:00:00Z'),
  endsAt: new Date('2026-08-01T11:00:00Z'),
  roomPath: '/sessions/session-1/room',
  venue: null,
  playerName: 'Anna',
  coachName: 'Coach Li',
  coachProfileId: 'profile-1',
  amountMinor: 4005,
  feeMinor: 401,
  currency: 'EUR',
  clipsCount: 0,
  sequence: 0,
};

const player: CalendarAttendee = {
  email: 'player@example.com',
  displayName: 'Anna',
  locale: 'en',
  timezone: 'Europe/Berlin',
  role: 'player',
};
const coach: CalendarAttendee = {
  email: 'coach@example.com',
  displayName: 'Coach Li',
  locale: 'de',
  timezone: 'Europe/Berlin',
  role: 'coach',
};

describe('buildSessionIcs', () => {
  it('emits a REQUEST event with UTC times, stable UID, and the room URL', () => {
    const ics = buildSessionIcs({
      sessionId: 'session-1',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      summary: 'PlayWithPro consultation session',
      location: ROOM_URL,
      locationIsUrl: true,
      description: `Join the session room: ${ROOM_URL}`,
      organizerEmail: 'no-reply@playwithpro.local',
      attendeeEmails: ['player@example.com'],
      method: 'REQUEST',
      sequence: 0,
    });

    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain(`UID:${sessionUid('session-1')}`);
    expect(ics).toContain('DTSTART:20260801T100000Z');
    expect(ics).toContain('DTEND:20260801T110000Z');
    expect(ics).toContain('SEQUENCE:0');
    expect(ics).toContain(`URL:${ROOM_URL}`);
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
  const deliver = jest.fn<Promise<void>, [string, OutgoingMail]>();
  const provider = new IcsCalendarProvider(
    { deliver } as unknown as MailerService,
    new EmailRenderer(config),
    config,
  );

  beforeEach(() => deliver.mockReset());

  it('sends the player a localized receipt listing only that attendee', async () => {
    await provider.sendInvite(input, player);

    const [to, mail] = deliver.mock.calls[0];
    expect(to).toBe('player@example.com');
    expect(mail.subject).toContain('is booked');
    expect(mail.text).toContain('Coach Li');
    expect(mail.text).toContain('€40.05');
    expect(mail.text).toContain('(Europe/Berlin)');
    expect(mail.text).toContain('Join the session room:');
    const ics = mail.attachments?.[0].content ?? '';
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('SEQUENCE:0');
    expect(ics).toContain('mailto:player@example.com');
    expect(ics).not.toContain('coach@example.com');
  });

  it('sends the coach a new-booking email in their own language', async () => {
    await provider.sendInvite({ ...input, clipsCount: 2 }, coach);

    const [to, mail] = deliver.mock.calls[0];
    expect(to).toBe('coach@example.com');
    expect(mail.subject).toContain('Neue Buchung');
    expect(mail.text).toContain('2 Clips angehängt');
    expect(mail.attachments?.[0].content).toContain(
      'SUMMARY:PlayWithPro-Sitzung: Beratung',
    );
    // The room link opens in the recipient's language, in the body and the invite.
    const roomUrl = 'http://localhost:3000/de/sessions/session-1/room';
    expect(mail.text).toContain(roomUrl);
    expect(mail.attachments?.[0].content).toContain(`URL:${roomUrl}`);
  });

  it('revokes with a higher sequence and names who cancelled', async () => {
    await provider.sendCancellation({ ...input, sequence: 1 }, player, {
      cancelledBy: 'coach',
      tier: 'free',
      refundMinor: 4005,
      coachNetMinor: 0,
    });

    const [, mail] = deliver.mock.calls[0];
    expect(mail.subject).toBe('Coach Li cancelled your session');
    expect(mail.text).toContain('refunded to you in full');
    expect(mail.attachments?.[0].content).toContain('METHOD:CANCEL');
    expect(mail.attachments?.[0].content).toContain('SEQUENCE:1');
    expect(mail.attachments?.[0].contentType).toContain('method=CANCEL');
  });

  it('tells both sides what a late cancellation means in money', async () => {
    const details = {
      cancelledBy: 'player',
      tier: 'partial',
      refundMinor: 2003,
      coachNetMinor: 1802,
    } as const;
    await provider.sendCancellation({ ...input, sequence: 1 }, player, details);
    await provider.sendCancellation({ ...input, sequence: 1 }, coach, details);

    const [[, toPlayer], [, toCoach]] = deliver.mock.calls;
    expect(toPlayer.subject).toBe('You cancelled your session with Coach Li');
    expect(toPlayer.text).toContain('€20.03 is refunded to you');
    expect(toPlayer.text).toContain('original start time');
    // The coach reads German.
    expect(toCoach.text).toContain('18,02');
    expect(toCoach.text).toContain('vollen Betrag erstatten');
  });

  it('names the platform when an admin cancels as force majeure', async () => {
    await provider.sendCancellation({ ...input, sequence: 1 }, player, {
      cancelledBy: 'admin',
      tier: 'free',
      refundMinor: 4005,
      coachNetMinor: 0,
    });

    const [, mail] = deliver.mock.calls[0];
    expect(mail.subject).toBe('Your session with Coach Li was cancelled');
    expect(mail.text).toContain('Our team had to cancel');
    expect(mail.text).toContain('refunded to you in full');
  });

  it('propagates delivery failures so the outbox can retry', async () => {
    deliver.mockRejectedValueOnce(new Error('smtp down'));
    await expect(provider.sendInvite(input, player)).rejects.toThrow(
      'smtp down',
    );
  });
});
