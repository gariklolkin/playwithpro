# Design: add-auth-and-accounts

## Data model (Prisma)

```prisma
enum Role { AMATEUR PROFESSIONAL ADMIN }

model User {
  id              String    @id @default(uuid())
  email           String    @unique
  passwordHash    String?             // null for OAuth-only accounts
  role            Role
  displayName     String
  locale          String    @default("en")
  timezone        String    @default("UTC")
  emailVerifiedAt DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  oauthAccounts   OAuthAccount[]
  refreshTokens   RefreshToken[]
}

model OAuthAccount {
  id                String @id @default(uuid())
  userId            String
  provider          String              // "google"
  providerAccountId String
  user              User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model RefreshToken {
  id         String    @id @default(uuid())
  userId     String
  tokenHash  String    @unique          // sha256 of the opaque token
  expiresAt  DateTime
  revokedAt  DateTime?
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {                // email verification + password reset
  id        String   @id @default(uuid())
  userId    String
  kind      String                       // "email_verify" | "password_reset"
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
}
```

## Decisions

- **Passwords:** argon2id (`argon2` package). Min 8 chars; no arbitrary complexity rules.
- **Tokens:** access JWT 15 min (payload: sub, role), refresh opaque token 30 days, rotated on every refresh, stored hashed; reuse of a rotated token revokes the whole family. Delivery: httpOnly secure cookies (SameSite=Lax) — no tokens in localStorage.
- **Google OAuth:** authorization-code flow handled by the API (`GET /auth/google` → consent → `GET /auth/google/callback`), implemented directly (fetch to Google's token endpoint + id_token decode) rather than passport-google-oauth20 — passport's `state` support requires express-session, while a signed httpOnly state cookie needs no session middleware. If a verified user with the same email exists → link; else the visitor picks amateur/professional on a "complete signup" step (`POST /auth/oauth/complete`), backed by a short-lived pending-signup JWT cookie — no user row exists until the role is chosen.
- **Email:** nodemailer via SMTP env vars (Mailpit locally). Templates in English for now; localized in `add-i18n`.
- **Email verification policy:** unverified users can log in but cannot book/publish (enforced by `EmailVerifiedGuard` on relevant endpoints in later changes).
- **Admin:** `prisma/seed.ts` creates admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env (dev only; documented).
- **API surface:**
  `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`,
  `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/oauth/complete`,
  `POST /auth/email/resend`, `POST /auth/email/verify`,
  `POST /auth/password/forgot`, `POST /auth/password/reset`,
  `GET /users/me`, `PATCH /users/me`, `PATCH /users/me/password`, `DELETE /users/me/oauth/google`
- **Web:** Next.js middleware checks the access-token cookie for protected segments (`/dashboard`, `/settings`); server components fetch `/users/me`; auth forms are client components with shadcn/ui inputs per `design/DESIGN.md` tokens. Role-specific empty dashboard shells: `/dashboard` renders amateur or pro layout by role.
- **next-intl bootstrap:** installed with a single `en` message catalog and no locale routing yet; all new UI strings go through it (hard convention). `add-i18n` adds routing + fr/de/ru/zh.
- **Shared:** `Role` enum and auth request/response types in `packages/shared`.

## Security notes

- Rate limit auth endpoints (`@nestjs/throttler`): 10 req/min per IP on register/login/forgot.
- Generic error messages on login/forgot (no user enumeration).
- CSRF: state parameter on OAuth; cookies SameSite=Lax; mutating endpoints require the access token.

## Alternatives considered

- **NextAuth/Auth.js on the web side** — rejected: session truth must live in the API (mobile clients later, single source of authz for booking/payments).
- **Sessions table instead of JWT** — JWT+refresh keeps API stateless per-request while refresh rotation preserves revocability; simpler horizontal scaling.
