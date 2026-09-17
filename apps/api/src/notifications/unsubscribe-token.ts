import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PreferenceKey } from './notification-kinds';

/** Unsubscribe links stay valid this long; a rotated secret voids all of them. */
export const UNSUBSCRIBE_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export interface UnsubscribeClaims {
  userId: string;
  category: PreferenceKey;
  exp: number;
}

const CATEGORIES: PreferenceKey[] = [
  'emailReminders',
  'emailClipChanges',
  'emailReviews',
];

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** `base64url(json).hmac` — self-contained, no table lookup on the way in. */
export function signUnsubscribeToken(
  secret: string,
  claims: Omit<UnsubscribeClaims, 'exp'>,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ ...claims, exp: now + UNSUBSCRIBE_TOKEN_TTL_MS }),
  ).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

/** Null for a tampered, malformed, expired or unknown-category token. */
export function verifyUnsubscribeToken(
  secret: string,
  token: string,
  now = Date.now(),
): UnsubscribeClaims | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(secret, payload);
  if (
    expected.length !== signature.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<UnsubscribeClaims>;
    if (
      typeof claims.userId !== 'string' ||
      typeof claims.exp !== 'number' ||
      claims.exp < now ||
      !CATEGORIES.includes(claims.category as PreferenceKey)
    ) {
      return null;
    }
    return claims as UnsubscribeClaims;
  } catch {
    return null;
  }
}
