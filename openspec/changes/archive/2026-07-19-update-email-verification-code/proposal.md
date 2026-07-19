# update-email-verification-code

## Why

Email confirmation currently works via an emailed link that verifies (and signs the user in) automatically when the page loads. Two problems:

1. **Scanner fragility.** Corporate mail filters (Outlook Safe Links, antivirus link checkers, messenger previews) open URLs from emails automatically. Any of them that executes JS burns the single-use token before the human ever clicks, and session cookies can be issued to a bot's environment.
2. **Broken continuity.** The link may be opened on a different device/browser than the one where registration happened, and the intermediate "You're all set → Go to dashboard" screen is a pointless hop.

The owner picked the modern OTP approach (Slack/WhatsApp-style): the user stays on the registration screen and types a 6-digit code from the email. Bots cannot type codes; the session is issued exactly where the user is; no intermediate screen — straight to the dashboard.

## What Changes

- **API**: `POST /auth/email/verify` accepts `{ email, code }` instead of `{ token }`. Codes are 6 random digits, valid 15 minutes, stored hashed, single active code per user (resend invalidates the previous one), max 5 wrong attempts per code, endpoint rate-limited per IP. Successful verification still signs the user in (mailbox control already equals account control via password reset). Password reset keeps its link flow — unchanged.
- **Mailer**: the verification email carries the code instead of a link.
- **Web**: after registration the same card turns into a code-entry form; success goes straight to `/dashboard`. The `/verify-email` page becomes an email+code form (for the login-with-unverified-email path and returning users). No email addresses in URL query params.
- **Spec cleanup folded in**: duplicate-email registration now returns an explicit 409 "account exists — log in" (already implemented; the OAuth flow revealed email existence anyway, so the "generic error" requirement was security theater).

## Impact

- Affected specs: `auth` (Email and password registration, Email verification).
- Affected code: `apps/api` auth module (token service, auth service/controller, DTOs, mailer, Prisma `VerificationToken.attempts` column + migration), `apps/web` register card, verify-email page, login card, message catalogs (5 locales), tests.
- Old emailed links stop working (MVP, no real users — acceptable; the resend flow covers stragglers).
