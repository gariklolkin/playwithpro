import { ConfigService } from '@nestjs/config';
import { JitsiVideoProvider } from './jitsi-video.provider';

describe('JitsiVideoProvider', () => {
  const provider = new JitsiVideoProvider({
    getOrThrow: () => 'meet.example.org',
  } as unknown as ConfigService);

  it('composes an embedded descriptor from the configured domain and slug', () => {
    expect(provider.getRoom({ roomSlug: 'abc123' })).toEqual({
      kind: 'embedded_jitsi',
      domain: 'meet.example.org',
      roomName: 'playwithpro-abc123',
    });
  });

  it('is deterministic for the same slug', () => {
    expect(provider.getRoom({ roomSlug: 'abc123' })).toEqual(
      provider.getRoom({ roomSlug: 'abc123' }),
    );
  });
});
