import type { ConfigService } from '@nestjs/config';
import { TokenVerifier } from 'livekit-server-sdk';
import {
  LiveKitVideoProvider,
  TOKEN_TTL_SECONDS,
} from './livekit-video.provider';

describe('LiveKitVideoProvider', () => {
  const env: Record<string, string> = {
    LIVEKIT_URL: 'wss://meet.example.org',
    LIVEKIT_API_KEY: 'key1',
    LIVEKIT_API_SECRET: 'a-secret-that-is-long-enough-for-hs256',
  };
  const provider = new LiveKitVideoProvider({
    getOrThrow: (key: string) => env[key],
  } as unknown as ConfigService);

  it('describes the room by slug with the public signaling url', () => {
    expect(provider.describeRoom({ roomSlug: 'abc123' })).toEqual({
      kind: 'livekit',
      url: 'wss://meet.example.org',
      roomName: 'abc123',
    });
  });

  it('mints a token bound to the user, the room, and a short ttl', async () => {
    const before = Math.floor(Date.now() / 1000);
    const jwt = await provider.issueToken({
      roomSlug: 'abc123',
      participant: { id: 'user-1', displayName: 'Ann', role: 'coach' },
    });
    const claims = await new TokenVerifier(
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    ).verify(jwt);

    expect(claims.sub).toBe('user-1');
    expect(claims.name).toBe('Ann');
    expect(claims.metadata).toBe('{"role":"coach"}');
    expect(claims.video).toMatchObject({
      room: 'abc123',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      roomCreate: false,
    });
    expect(claims.exp).toBeLessThanOrEqual(before + TOKEN_TTL_SECONDS + 5);
  });

  it('rejects verification with a different secret', async () => {
    const jwt = await provider.issueToken({
      roomSlug: 'abc123',
      participant: { id: 'user-1', displayName: 'Ann', role: 'player' },
    });
    await expect(
      new TokenVerifier(
        'key1',
        'another-secret-long-enough-for-hs256-x',
      ).verify(jwt),
    ).rejects.toThrow();
  });
});
