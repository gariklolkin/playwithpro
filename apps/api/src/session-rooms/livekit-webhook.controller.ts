import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import { AttendanceEvidenceService } from './attendance-evidence.service';

/**
 * Inbound LiveKit webhooks. Authenticity is a JWT (signed with the shared
 * API secret) carrying a hash of the raw body, so the route is public but
 * unforgeable. Handlers never fail the request for bad data — LiveKit would
 * retry, and there is nothing to retry.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('livekit')
export class LiveKitWebhookController {
  private readonly logger = new Logger(LiveKitWebhookController.name);
  private readonly receiver: WebhookReceiver;

  constructor(
    config: ConfigService,
    private readonly evidence: AttendanceEvidenceService,
  ) {
    this.receiver = new WebhookReceiver(
      config.getOrThrow<string>('LIVEKIT_API_KEY'),
      config.getOrThrow<string>('LIVEKIT_API_SECRET'),
    );
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    const body = req.rawBody?.toString('utf8');
    if (!body) {
      throw new UnauthorizedException();
    }
    let event: WebhookEvent;
    try {
      event = await this.receiver.receive(body, authorization);
    } catch {
      throw new UnauthorizedException();
    }

    const roomName = event.room?.name;
    const identity = event.participant?.identity;
    if (!roomName || !identity) return;

    switch (event.event) {
      case 'participant_joined':
        await this.evidence.recordConnected({
          roomName,
          identity,
          // The participant's own join time is stable across redeliveries.
          at: secondsToDate(event.participant?.joinedAt, event.createdAt),
        });
        return;
      case 'participant_left':
        await this.evidence.recordLeft({
          roomName,
          identity,
          at: secondsToDate(event.createdAt),
        });
        return;
      default:
        this.logger.debug(`Ignoring LiveKit event ${event.event}`);
    }
  }
}

function secondsToDate(...candidates: Array<bigint | undefined>): Date {
  for (const value of candidates) {
    if (value !== undefined && value > 0n) {
      return new Date(Number(value) * 1000);
    }
  }
  return new Date();
}
