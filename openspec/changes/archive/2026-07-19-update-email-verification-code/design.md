# Design — update-email-verification-code

## Code generation and storage

- 6 digits from `crypto.randomInt(0, 1_000_000)`, zero-padded. ~20 bits of entropy — safe only together with attempt limiting and TTL.
- Reuses the `VerificationToken` table (`kind = "email_verify"`). New column `attempts Int @default(0)`.
- Stored as `sha256("<userId>:<code>")` in the existing unique `tokenHash` column — salting by userId avoids cross-user hash collisions of identical codes.
- Creating a code first deletes the user's previous `email_verify` rows: one active code per user, resend invalidates the old one.
- TTL 15 minutes (`EMAIL_CODE_TTL_MS`), separate from the 1-hour link-token TTL that password reset keeps using.

## Verification

- Lookup by `(userId, kind)` — the user is found by the submitted email first; any failure (unknown email, no active code, expired, wrong code, already verified) returns the same generic 400 "invalid or expired code" — no enumeration.
- Wrong code: increment `attempts`; the 5th failure burns the code (`usedAt` set) so a brute-forcer must trigger resend (which is IP-throttled), and 10^6 space is unreachable.
- `POST /auth/email/verify` gets the same strict per-IP `@Throttle(AUTH_THROTTLE)` as login.
- Success: mark code used, set `emailVerifiedAt`, issue cookies (unchanged `signIn` path).

## Web flow

- **Register card**: the post-submit state is a code form (info text, one input, confirm button, resend link). The email lives in component state; success routes to `/dashboard`.
- **`/verify-email` page**: standalone email+code form. The login card stores the email in `sessionStorage` (`pendingVerificationEmail`) before linking here so the field is prefilled without putting the address in the URL.
- **Login card (403 path)**: message stays; the CTA becomes "enter the code" linking to `/verify-email` (plus resend, which now sends a code).

## Out of scope

- Password reset stays link-based: the reset flow needs its own form anyway and does not issue a session.
- Email localization (mailer is English-only across the app; a future change).
