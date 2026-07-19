# Change: add-verification-scheduling

## Why

Today the identity video call — the last gate before a coach can publish services — is arranged by hand: the coach leaves a Telegram/WhatsApp contact, an admin writes to them, and they negotiate a time in chat. That doesn't scale past a handful of verifications, leaks personal messenger contacts into the platform, and excludes coaches who have neither messenger. Replace it with self-service scheduling: admins publish slots, coaches book one, a Google Meet link is generated automatically, and email does the rest.

## What Changes

- **Slot scheduling:** admins publish verification slots (single or recurring batch); a coach opens the Verification page, sees open slots in their own timezone, books one. Booking is race-safe — a slot can never be double-booked and disappears from the list immediately.
- **Video meeting:** each booking gets a Google Calendar event with a generated Google Meet link on a platform-owned calendar; the coach is invited by email. No Google account is required of the coach — the Meet URL is stored in our DB and shown on the verification page, in the profile, and in every email. The marketplace DB is the source of truth; Google sync is asynchronous with retries and never blocks booking.
- **Verification state machine:** `VerificationRequest` gains explicit states — `AWAITING_SCHEDULING`, `SCHEDULED`, `IN_PROGRESS`, `VERIFIED`, `REJECTED`, `CANCELLED`. No-show and admin cancellation are booking outcomes that return the request to `AWAITING_SCHEDULING` (2 no-shows auto-cancel the request).
- **Emails:** booking confirmation (with `.ics` attachment), reminders 24 h and 1 h before, reschedule/cancel/no-show notices — each with date, time, the coach's timezone, Meet link, and reschedule/cancel links leading to the authenticated verification page.
- **Rescheduling:** atomic rebook — coach picks a new slot, the old slot reopens, the Google event is patched in place (same event, same Meet link).
- **Cancellation:** by coach (frees the slot or withdraws the request) or by admin (removing a booked slot notifies the coach to pick a new time).
- **Admin UI:** slots tab (publish single/batch, remove) and bookings tab (today's calls, join link, start / approve / reject / no-show / reschedule, failed Google syncs surfaced).
- **BREAKING** — **contact fields removed:** `contactTelegram` / `contactPhone` are dropped from `VerificationRequest`, the submission form, and admin views; the "call requested" admin action and its email are removed (superseded by scheduling). Any remaining admin-only contact display carries the note that it is never published.

## Capabilities

### New Capabilities
- `verification-scheduling`: slot publication, booking, double-booking prevention, meeting-link generation (Google Calendar/Meet behind a provider interface), confirmation/reminder emails, rescheduling, cancellation, timezone handling, and the coach-facing + admin-facing scheduling UI.

### Modified Capabilities
- `pro-verification`: submission no longer collects messenger contacts; the "identity video call" requirement is redefined from "admin reaches out via the contact left" to "coach books a published slot"; verification status visibility extends to the new states and the scheduled-meeting card. (Delta is written against the `pro-verification` spec introduced by `add-pro-profiles-verification`, which must be archived/synced first.)
- `auth`: email verification becomes a hard gate — registration issues no session, login/refresh reject unverified accounts, and the verification link signs the user in. The scheduling flow depends on a working email, so unverified users must not reach it (or anything else).

## Impact

- Affected specs: `verification-scheduling` (new), `pro-verification` (modified).
- `apps/api`: Prisma — new `VerificationSlot`, `VerificationBooking` models, new state enum + `noShowCount` on `VerificationRequest`, migration dropping contact columns; new `scheduling` module (slots, bookings, state transitions); `MeetingProvider` interface + Google Calendar adapter (service account with domain-wide delegation over a platform Workspace calendar); `@nestjs/schedule` cron for reminders and Google-sync retries; mailer templates for confirmation/reminders/reschedule/cancel/no-show; removal of `sendVerificationCallEmail`.
- `apps/web`: coach Verification page (slot picker in viewer timezone, scheduled-meeting card with Join/Reschedule/Cancel), profile verification card, admin slots + bookings tabs; message catalogs ×5.
- `packages/shared`: state/status enums, DTO types.
- New dependencies: `googleapis`, `@nestjs/schedule`; new env vars for the Google service account and calendar id.
- Depends on: `add-pro-profiles-verification` (implemented, pending archive) — this change modifies its `pro-verification` spec and replaces its call-invitation flow.
- Non-goals: coach-facing booking of paid sessions (separate availability system), SMS/messenger notifications, admin working-hours preferences, video recording.
