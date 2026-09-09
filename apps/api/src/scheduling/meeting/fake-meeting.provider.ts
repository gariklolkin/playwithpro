import { Injectable, Logger } from '@nestjs/common';
import {
  CreateMeetingInput,
  MeetingDetails,
  MeetingProvider,
} from './meeting-provider';

/**
 * Dev/test stand-in: no API calls, no calendar — the join URL points at a
 * public Jitsi Meet room (anonymous, browser-only) so the admin verification
 * flow can be exercised end to end locally. Unrelated to session rooms,
 * which run on the platform's own LiveKit server.
 */
@Injectable()
export class FakeMeetingProvider implements MeetingProvider {
  private readonly logger = new Logger(FakeMeetingProvider.name);

  create(input: CreateMeetingInput): Promise<MeetingDetails> {
    this.logger.log(`Fake meeting created for booking ${input.bookingId}`);
    return Promise.resolve({
      externalId: `fake-event-${input.bookingId}`,
      joinUrl: `https://meet.jit.si/PlayWithProVerify-${input.bookingId}`,
    });
  }

  update(): Promise<void> {
    return Promise.resolve();
  }

  cancel(): Promise<void> {
    return Promise.resolve();
  }
}
