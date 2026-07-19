import { ConfigService } from '@nestjs/config';
import { GoogleMeetingProvider } from './google-meeting.provider';

const events = {
  insert: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
};

jest.mock('googleapis', () => ({
  google: {
    auth: { JWT: jest.fn() },
    calendar: jest.fn(() => ({ events })),
  },
}));

const config = {
  get: (key: string) =>
    ({
      GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'sa@project.iam.gserviceaccount.com',
        private_key: 'key',
      }),
      GOOGLE_CALENDAR_ID: 'verify@playwithpro.com',
      GOOGLE_IMPERSONATE_SUBJECT: 'verify@playwithpro.com',
    })[key],
} as unknown as ConfigService;

describe('GoogleMeetingProvider', () => {
  let provider: GoogleMeetingProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GoogleMeetingProvider(config);
  });

  it('creates an event with a generated Meet link and the coach as attendee', async () => {
    events.insert.mockResolvedValue({
      data: {
        id: 'evt-1',
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
      },
    });

    const meeting = await provider.create({
      bookingId: 'booking-1',
      summary: 'PlayWithPro verification call',
      description: 'desc',
      startsAt: new Date('2026-07-21T12:30:00Z'),
      endsAt: new Date('2026-07-21T12:45:00Z'),
      attendeeEmail: 'coach@example.com',
    });

    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'verify@playwithpro.com',
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: expect.objectContaining({
          attendees: [{ email: 'coach@example.com' }],
          conferenceData: {
            createRequest: {
              requestId: 'booking-1',
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }) as object,
      }),
    );
    expect(meeting).toEqual({
      externalId: 'evt-1',
      joinUrl: 'https://meet.google.com/abc-defg-hij',
    });
  });

  it('falls back to the video entry point when hangoutLink is absent', async () => {
    events.insert.mockResolvedValue({
      data: {
        id: 'evt-2',
        conferenceData: {
          entryPoints: [
            { entryPointType: 'phone', uri: 'tel:+1' },
            { entryPointType: 'video', uri: 'https://meet.google.com/xyz' },
          ],
        },
      },
    });

    const meeting = await provider.create({
      bookingId: 'booking-2',
      summary: 's',
      description: 'd',
      startsAt: new Date(),
      endsAt: new Date(),
      attendeeEmail: 'coach@example.com',
    });

    expect(meeting.joinUrl).toBe('https://meet.google.com/xyz');
  });

  it('throws when Google returns no Meet link so the sync can retry', async () => {
    events.insert.mockResolvedValue({ data: { id: 'evt-3' } });

    await expect(
      provider.create({
        bookingId: 'booking-3',
        summary: 's',
        description: 'd',
        startsAt: new Date(),
        endsAt: new Date(),
        attendeeEmail: 'coach@example.com',
      }),
    ).rejects.toThrow('Meet link');
  });

  it('patches the same event on reschedule', async () => {
    events.patch.mockResolvedValue({});

    await provider.update('evt-1', {
      startsAt: new Date('2026-07-22T09:00:00Z'),
      endsAt: new Date('2026-07-22T09:15:00Z'),
    });

    expect(events.patch).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-1', sendUpdates: 'all' }),
    );
  });

  it('swallows delete failures (event already gone)', async () => {
    events.delete.mockRejectedValue(new Error('410 Gone'));

    await expect(provider.cancel('evt-1')).resolves.toBeUndefined();
  });
});
