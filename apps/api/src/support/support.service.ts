import { createHmac } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportIdentityResponse } from '@playwithpro/shared';

/**
 * Verified identity for the in-app support channel: the vendor accepts a
 * user id together with an HMAC-SHA256 over it, signed with a secret that
 * exists only on the API. Tickets then follow the user across devices and
 * the id cannot be spoofed from the browser.
 */
@Injectable()
export class SupportService {
  constructor(private readonly config: ConfigService) {}

  /** `POSTHOG_SUPPORT_SECRET` (the vendor's support secret key); empty = channel off. */
  private secret(): string | undefined {
    const value = this.config.get<string>('POSTHOG_SUPPORT_SECRET');
    return value && value.trim() !== '' ? value : undefined;
  }

  identityFor(userId: string): SupportIdentityResponse {
    const secret = this.secret();
    if (!secret) {
      throw new NotFoundException('Support identity is not configured.');
    }
    return { userId, hash: computeIdentityHash(secret, userId) };
  }
}

export function computeIdentityHash(secret: string, userId: string): string {
  return createHmac('sha256', secret).update(userId).digest('hex');
}
