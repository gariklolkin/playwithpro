import { Role } from '@playwithpro/shared';
import { CookieOptions, Response } from 'express';
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from './token.service';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const OAUTH_STATE_COOKIE = 'oauth_state';
export const OAUTH_PENDING_COOKIE = 'oauth_pending';

const OAUTH_COOKIE_TTL_MS = 15 * 60 * 1000;

/** User attached to the request by JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// When web and api live on sibling hosts (play-with.pro / api.play-with.pro)
// the access token must be set on the parent domain so the web app's SSR can
// forward it; host-only cookies (dev: shared localhost) need no domain.
function baseOptions(secure: boolean, domain?: string): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, ...(domain && { domain }) };
}

export function setAuthCookies(
  res: Response,
  tokens: AuthTokens,
  secure: boolean,
  domain?: string,
): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseOptions(secure, domain),
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_MS,
  });
  // Scoped to /auth so the refresh token only travels to auth endpoints.
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseOptions(secure, domain),
    path: '/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function setOAuthCookie(
  res: Response,
  name: string,
  value: string,
  secure: boolean,
  domain?: string,
): void {
  res.cookie(name, value, {
    ...baseOptions(secure, domain),
    path: '/auth',
    maxAge: OAUTH_COOKIE_TTL_MS,
  });
}

export function clearOAuthCookie(
  res: Response,
  name: string,
  secure: boolean,
  domain?: string,
): void {
  res.clearCookie(name, { ...baseOptions(secure, domain), path: '/auth' });
}

export function clearAuthCookies(
  res: Response,
  secure: boolean,
  domain?: string,
): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    ...baseOptions(secure, domain),
    path: '/',
  });
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...baseOptions(secure, domain),
    path: '/auth',
  });
}
