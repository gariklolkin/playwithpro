/**
 * Port for the video-meeting/calendar integration. The marketplace DB is the
 * source of truth; whatever sits behind this interface is an implementation
 * detail and must never block or revert a booking.
 */
export interface MeetingDetails {
  externalId: string;
  joinUrl: string;
}

export interface CreateMeetingInput {
  /** Used as an idempotency key for conference creation. */
  bookingId: string;
  summary: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  attendeeEmail: string;
}

export interface MeetingProvider {
  create(input: CreateMeetingInput): Promise<MeetingDetails>;
  update(
    externalId: string,
    times: { startsAt: Date; endsAt: Date },
  ): Promise<void>;
  cancel(externalId: string): Promise<void>;
}

export const MEETING_PROVIDER = Symbol('MEETING_PROVIDER');
