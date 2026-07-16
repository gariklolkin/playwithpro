# Change: add-auth-and-accounts

## Why

Every subsequent capability (profiles, booking, payments) needs identified users with roles. The platform must support users **without a Google account** (email + password) while offering Google sign-in as a convenience — and as the future consent gateway for Calendar/Meet integration.

## What Changes

- **Registration & login (email + password):** signup with role choice (amateur | professional), email verification link (via SMTP — Mailpit locally), login, logout.
- **Google OAuth:** sign in / sign up with Google; link/unlink Google to an existing email account. Minimal scopes (`openid email profile`) — calendar scopes come in a later change.
- **Sessions:** short-lived JWT access token + rotating refresh tokens (hashed in DB, revocable).
- **Password reset:** forgot/reset flow via email.
- **Roles & authorization:** `amateur | professional | admin` on the User model; NestJS guards + decorators; admin account seeded via script/env.
- **Account settings:** view/update own profile basics (name, locale, timezone), change password. (Coach professional profile is NOT here — that's `add-pro-profiles-verification`.)
- **Web pages:** /login, /register, /verify-email, /forgot-password, /reset-password, /settings/account; auth-aware navbar; protected route middleware; per-role dashboard shells (empty).
- **Minimal next-intl setup:** install with `en` catalog only so auth UI strings are externalized from day one (full 5-locale routing lands in `add-i18n`).

**New capability specs:** `auth`, `user-accounts`

## Impact

- Affected specs: `auth` (new), `user-accounts` (new)
- Affected code: `apps/api` (auth module, users module, Prisma schema migration, mailer), `apps/web` (auth pages, session handling, middleware, next-intl bootstrap), `packages/shared` (Role enum, auth DTO types)
- Non-goals: pro profile content & verification, availability, 5-locale translations, 2FA, rate limiting beyond basics
