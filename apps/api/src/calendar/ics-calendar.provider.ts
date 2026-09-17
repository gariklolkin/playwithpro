import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailRenderer,
  formatMoney,
  formatWhen,
} from '../mailer/email-renderer';
import { MailerService } from '../mailer/mailer.service';
import { sessionEmailParams } from '../mailer/session-email-params';
import type {
  CalendarAttendee,
  CalendarProvider,
  CancellationDetails,
  CalendarSessionInput,
} from './calendar-provider';
import { buildSessionIcs } from './session-ics';

/**
 * Universal .ics email invites: works for every attendee regardless of
 * calendar vendor, no account connection required. One email per attendee,
 * localized, listing only that attendee (the counterpart's address never
 * travels in someone else's invite). Google Calendar API implementation
 * slots in behind the same port later.
 */
@Injectable()
export class IcsCalendarProvider implements CalendarProvider {
  private readonly logger = new Logger(IcsCalendarProvider.name);
  private readonly organizerEmail: string;

  constructor(
    private readonly mailer: MailerService,
    private readonly renderer: EmailRenderer,
    config: ConfigService,
  ) {
    const from = config.getOrThrow<string>('SMTP_FROM');
    this.organizerEmail = from.match(/<([^>]+)>/)?.[1] ?? from;
  }

  async sendInvite(
    input: CalendarSessionInput,
    attendee: CalendarAttendee,
  ): Promise<void> {
    await this.mailer.deliver(attendee.email, {
      ...this.renderer.render(
        attendee.locale,
        `session.paid.${attendee.role}`,
        sessionEmailParams(this.renderer, input, attendee),
      ),
      attachments: [
        this.attachment(input, attendee, 'REQUEST', input.sequence),
      ],
    });
    this.logger.log(
      `Sent session invite for ${input.sessionId} (${attendee.role})`,
    );
  }

  async sendUpdate(
    input: CalendarSessionInput,
    attendee: CalendarAttendee,
    previousStartsAt?: Date,
  ): Promise<void> {
    const locale = this.renderer.resolveLocale(attendee.locale);
    await this.mailer.deliver(attendee.email, {
      ...this.renderer.render(
        attendee.locale,
        `session_updated.${attendee.role}`,
        {
          ...sessionEmailParams(this.renderer, input, attendee),
          previousLine: previousStartsAt
            ? this.renderer.message(locale, 'session_updated.previousLine', {
                when: formatWhen(previousStartsAt, locale, attendee.timezone),
              })
            : '',
        },
      ),
      attachments: [
        this.attachment(input, attendee, 'REQUEST', input.sequence),
      ],
    });
    this.logger.log(
      `Sent session update for ${input.sessionId} (${attendee.role})`,
    );
  }

  async sendCancellation(
    input: CalendarSessionInput,
    attendee: CalendarAttendee,
    details: CancellationDetails,
  ): Promise<void> {
    await this.mailer.deliver(attendee.email, {
      ...this.renderer.render(
        attendee.locale,
        `session.cancelled.${attendee.role}`,
        {
          ...sessionEmailParams(this.renderer, input, attendee),
          cancelledBy: details.cancelledBy,
          tier: details.tier,
          refund: formatMoney(
            details.refundMinor,
            input.currency,
            this.renderer.resolveLocale(attendee.locale),
          ),
          coachNet: formatMoney(
            details.coachNetMinor,
            input.currency,
            this.renderer.resolveLocale(attendee.locale),
          ),
          url:
            attendee.role === 'player'
              ? this.renderer.link(
                  attendee.locale,
                  `/coaches/${input.coachProfileId}`,
                )
              : this.renderer.link(attendee.locale, '/dashboard/sessions'),
        },
      ),
      attachments: [this.attachment(input, attendee, 'CANCEL', input.sequence)],
    });
    this.logger.log(
      `Sent session cancellation for ${input.sessionId} (${attendee.role})`,
    );
  }

  private attachment(
    input: CalendarSessionInput,
    attendee: CalendarAttendee,
    method: 'REQUEST' | 'CANCEL',
    sequence: number,
  ) {
    const locale = this.renderer.resolveLocale(attendee.locale);
    const service = this.renderer.message(
      locale,
      `service.${input.serviceType}`,
    );
    const roomUrl = input.roomPath
      ? this.renderer.link(locale, input.roomPath)
      : null;
    const location = roomUrl ?? input.venue ?? '';
    const ics = buildSessionIcs({
      sessionId: input.sessionId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      summary: this.renderer.message(locale, 'calendar.summary', { service }),
      location,
      locationIsUrl: roomUrl !== null,
      description: roomUrl
        ? this.renderer.message(locale, 'calendar.descriptionRoom', {
            url: roomUrl,
          })
        : this.renderer.message(locale, 'calendar.descriptionVenue', {
            venue: input.venue ?? '',
          }),
      organizerEmail: this.organizerEmail,
      attendeeEmails: [attendee.email],
      method,
      sequence,
    });
    return {
      filename:
        method === 'CANCEL'
          ? 'playwithpro-session-cancelled.ics'
          : 'playwithpro-session.ics',
      content: ics,
      contentType: `text/calendar; charset=utf-8; method=${method}`,
    };
  }
}
