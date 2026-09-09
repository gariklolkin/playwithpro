import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RoomDescriptor } from '@playwithpro/shared';
import { AccessToken } from 'livekit-server-sdk';
import type { RoomInput, TokenInput, VideoProvider } from './video-provider';

/** Covers the initial connect only; LiveKit issues its own resume tokens after. */
export const TOKEN_TTL_SECONDS = 10 * 60;

/**
 * Self-hosted LiveKit: the room is named by the session slug, and admission
 * is a JWT minted here per participant — identity is the platform user id,
 * grants are limited to joining/publishing/subscribing in that one room.
 */
@Injectable()
export class LiveKitVideoProvider implements VideoProvider {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('LIVEKIT_URL');
    this.apiKey = config.getOrThrow<string>('LIVEKIT_API_KEY');
    this.apiSecret = config.getOrThrow<string>('LIVEKIT_API_SECRET');
  }

  describeRoom(input: RoomInput): RoomDescriptor {
    return { kind: 'livekit', url: this.url, roomName: input.roomSlug };
  }

  issueToken(input: TokenInput): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.participant.id,
      name: input.participant.displayName,
      metadata: JSON.stringify({ role: input.participant.role }),
      ttl: TOKEN_TTL_SECONDS,
    });
    token.addGrant({
      room: input.roomSlug,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      roomCreate: false,
    });
    return token.toJwt();
  }
}
