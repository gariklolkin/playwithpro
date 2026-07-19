import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calendar_v3, google } from 'googleapis';
import {
  CreateMeetingInput,
  MeetingDetails,
  MeetingProvider,
} from './meeting-provider';

/**
 * Google Calendar adapter: a service account with domain-wide delegation
 * impersonates a platform Workspace account that owns the verification
 * calendar. Coaches are invited as plain attendees by email and join the
 * generated Meet link from a browser — no Google account required of them.
 */
@Injectable()
export class GoogleMeetingProvider implements MeetingProvider {
  private readonly logger = new Logger(GoogleMeetingProvider.name);
  private readonly calendar: calendar_v3.Calendar;
  private readonly calendarId: string;

  constructor(config: ConfigService) {
    const key = JSON.parse(config.get<string>('GOOGLE_SA_KEY') ?? '{}') as {
      client_email?: string;
      private_key?: string;
    };
    const auth = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: config.get<string>('GOOGLE_IMPERSONATE_SUBJECT'),
    });
    this.calendar = google.calendar({ version: 'v3', auth });
    this.calendarId = config.get<string>('GOOGLE_CALENDAR_ID') ?? 'primary';
  }

  async create(input: CreateMeetingInput): Promise<MeetingDetails> {
    const { data } = await this.calendar.events.insert({
      calendarId: this.calendarId,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startsAt.toISOString() },
        end: { dateTime: input.endsAt.toISOString() },
        attendees: [{ email: input.attendeeEmail }],
        conferenceData: {
          createRequest: {
            requestId: input.bookingId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });
    const joinUrl =
      data.hangoutLink ??
      data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === 'video',
      )?.uri;
    if (!data.id || !joinUrl) {
      throw new Error('Google returned an event without id or Meet link');
    }
    return { externalId: data.id, joinUrl };
  }

  async update(
    externalId: string,
    times: { startsAt: Date; endsAt: Date },
  ): Promise<void> {
    await this.calendar.events.patch({
      calendarId: this.calendarId,
      eventId: externalId,
      sendUpdates: 'all',
      requestBody: {
        start: { dateTime: times.startsAt.toISOString() },
        end: { dateTime: times.endsAt.toISOString() },
      },
    });
  }

  async cancel(externalId: string): Promise<void> {
    try {
      await this.calendar.events.delete({
        calendarId: this.calendarId,
        eventId: externalId,
        sendUpdates: 'all',
      });
    } catch (error) {
      // Already gone is fine; anything else is logged, never propagated.
      this.logger.warn(`Failed to delete event ${externalId}`, error as Error);
    }
  }
}
