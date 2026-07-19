import { Injectable, Logger } from '@nestjs/common';
import {
  CreateMeetingInput,
  MeetingDetails,
  MeetingProvider,
} from './meeting-provider';

/**
 * Dev/test stand-in: no API calls, no calendar — but the join URL is a real
 * Jitsi room (anonymous, browser-only), so the whole flow works end to end
 * locally, including actually joining the call.
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
