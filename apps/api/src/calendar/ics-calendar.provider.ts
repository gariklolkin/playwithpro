import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../mailer/mailer.service';
import type {
  CalendarProvider,
  CalendarSessionInput,
} from './calendar-provider';
import { buildSessionIcs } from './session-ics';

/**
 * Universal .ics email invites: works for every attendee regardless of
 * calendar vendor, no account connection required. Google Calendar API
 * implementation slots in behind the same port later.
 */
@Injectable()
export class IcsCalendarProvider implements CalendarProvider {
  private readonly logger = new Logger(IcsCalendarProvider.name);
  private readonly organizerEmail: string;

  constructor(
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    const from = config.getOrThrow<string>('SMTP_FROM');
    this.organizerEmail = from.match(/<([^>]+)>/)?.[1] ?? from;
  }

  async sendInvite(input: CalendarSessionInput): Promise<void> {
    const ics = this.ics(input, 'REQUEST');
    await Promise.all(
      input.attendees.map((attendee) =>
        this.mailer.sendSessionInviteEmail({
          to: attendee.email,
          displayName: attendee.displayName,
          serviceLabel: input.serviceLabel,
          whenLine: whenLine(input),
          roomUrl: input.roomUrl,
          venue: input.venue,
          ics,
        }),
      ),
    );
    this.logger.log(`Sent session invite for ${input.sessionId}`);
  }

  async sendCancellation(input: CalendarSessionInput): Promise<void> {
    const ics = this.ics(input, 'CANCEL');
    await Promise.all(
      input.attendees.map((attendee) =>
        this.mailer.sendSessionCancelledEmail({
          to: attendee.email,
          displayName: attendee.displayName,
          serviceLabel: input.serviceLabel,
          whenLine: whenLine(input),
          ics,
        }),
      ),
    );
    this.logger.log(`Sent session cancellation for ${input.sessionId}`);
  }

  private ics(input: CalendarSessionInput, method: 'REQUEST' | 'CANCEL') {
    const location = input.roomUrl ?? input.venue ?? '';
    return buildSessionIcs({
      sessionId: input.sessionId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      summary: `PlayWithPro ${input.serviceLabel} session`,
      location,
      locationIsUrl: input.roomUrl !== null,
      description: input.roomUrl
        ? `Join the session room: ${input.roomUrl}`
        : `Meet at the venue: ${input.venue ?? ''}`,
      organizerEmail: this.organizerEmail,
      attendeeEmails: input.attendees.map((attendee) => attendee.email),
      method,
      // One cancellation ever follows one invite, so 0/1 is the whole story.
      sequence: method === 'CANCEL' ? 1 : 0,
    });
  }
}

/** UTC line for the email body; calendar apps localize the attached event. */
function whenLine(input: CalendarSessionInput): string {
  const day = input.startsAt.toISOString().slice(0, 10);
  const from = input.startsAt.toISOString().slice(11, 16);
  const to = input.endsAt.toISOString().slice(11, 16);
  return `${day}, ${from}–${to} UTC`;
}
