import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RoomDescriptor } from '@playwithpro/shared';
import type { RoomInput, VideoProvider } from './video-provider';

/**
 * Embedded Jitsi rooms: no vendor API to call — the room exists the moment
 * someone joins it, so the slug's unguessability is the only access control.
 */
@Injectable()
export class JitsiVideoProvider implements VideoProvider {
  private readonly domain: string;

  constructor(config: ConfigService) {
    this.domain = config.getOrThrow<string>('JITSI_DOMAIN');
  }

  getRoom(input: RoomInput): RoomDescriptor {
    return {
      kind: 'embedded_jitsi',
      domain: this.domain,
      roomName: `playwithpro-${input.roomSlug}`,
    };
  }
}
