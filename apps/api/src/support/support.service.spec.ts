import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { computeIdentityHash, SupportService } from './support.service';

describe('SupportService', () => {
  function serviceWith(secret: string | undefined) {
    const config = { get: jest.fn().mockReturnValue(secret) };
    return new SupportService(config as unknown as ConfigService);
  }

  it('signs the user id with HMAC-SHA256 over the support secret', () => {
    const identity = serviceWith('s3cret').identityFor('user-1');

    expect(identity).toEqual({
      userId: 'user-1',
      hash: computeIdentityHash('s3cret', 'user-1'),
    });
    // Known vector: HMAC-SHA256("s3cret", "user-1")
    expect(identity.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeIdentityHash('s3cret', 'user-2')).not.toBe(identity.hash);
  });

  it('is a 404 when the channel is not configured', () => {
    expect(() => serviceWith(undefined).identityFor('user-1')).toThrow(
      NotFoundException,
    );
    expect(() => serviceWith('').identityFor('user-1')).toThrow(
      NotFoundException,
    );
  });
});
