# Tasks — update-email-verification-code

## 1. API

- [x] 1.1 Prisma: add `attempts Int @default(0)` to `VerificationToken`; migration
- [x] 1.2 Token service: `createEmailCode` (delete old, salted hash, 15-min TTL) and `consumeEmailCode` (expiry, attempt counting, burn at 5)
- [x] 1.3 Auth service: send code on register/resend; `verifyEmail(email, code)` with generic failure; keep password reset on link tokens
- [x] 1.4 Controller/DTO: `POST /auth/email/verify` takes `{ email, code }`, add `@Throttle(AUTH_THROTTLE)`
- [x] 1.5 Mailer: verification email carries the code (15-min wording)
- [x] 1.6 Unit tests: happy path, wrong-code attempts/burn, expiry, resend invalidation, no enumeration

## 2. Web

- [x] 2.1 Register card: post-submit code form → success routes to `/dashboard`; resend link
- [x] 2.2 `/verify-email` page: email+code form; email prefilled via `sessionStorage` (never in URL)
- [x] 2.3 Login card 403 path: store email in `sessionStorage`, link to `/verify-email`; resend now sends a code
- [x] 2.4 Message catalogs: new/updated keys in all 5 locales
- [x] 2.5 Component tests: register→code→dashboard, wrong code error, login-403 path

## 3. Verify & wrap up

- [x] 3.1 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green
- [ ] 3.2 (deferred by owner 2026-07-19) Manual pass through register → code → dashboard in the dev env
- [x] 3.3 STOP — owner review; archive after approval
