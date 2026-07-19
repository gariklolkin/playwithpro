# Design: add-verification-scheduling

## Context

`add-pro-profiles-verification` shipped submission + admin approve/reject, with the identity call arranged manually: the coach leaves Telegram/WhatsApp, the admin clicks "invite to video call", and time is negotiated in a messenger. `VerificationRequest` already exists with `PENDING/APPROVED/REJECTED` statuses and contact columns.

Stack constraints: NestJS + Prisma/Postgres (`apps/api`), Next.js (`apps/web`), nodemailer/SMTP mailer that must never fail a request path, no queue/cron infrastructure yet, Google OAuth client already used for login (but per-user OAuth is unrelated to this design). `User` already carries `timezone` and a verified `email`.

## Goals / Non-Goals

**Goals:**
- Self-service booking of admin-published slots; zero manual back-and-forth for the happy path.
- Works for coaches without a Google account; Meet link always reachable from our own pages and emails.
- Marketplace DB is the single source of truth; Google Calendar is a swappable implementation detail whose outages never block booking.
- Race-safe booking, timezone-correct display everywhere, UTC in storage.

**Non-Goals:**
- Paid-session availability/booking (separate future capability; nothing here is reused for it by design — verification slots are admin-owned, not coach-owned).
- Messenger/SMS channels, meeting recording, admin calendars per-reviewer (slots are a shared pool for now).

## Decisions

### 1. Case state machine: 6 states, outcomes live on the booking

`VerificationRequest.state`: `AWAITING_SCHEDULING → SCHEDULED → IN_PROGRESS → VERIFIED | REJECTED`, plus terminal `CANCELLED`.

The brief proposed `NO_SHOW` and `RESCHEDULE_REQUIRED` as case states. Rejected: both mean exactly "pick a new time" — same allowed actions, same UI, different banner text. Modeling them as states doubles the transition table for no behavioral gain. Instead:

- `VerificationBooking.status` records the outcome: `SCHEDULED | COMPLETED | RESCHEDULED | NO_SHOW | CANCELLED_BY_PRO | CANCELLED_BY_ADMIN` — a full audit trail, one row per booking attempt.
- The case keeps `noShowCount` and derives the "why am I back here" banner from the latest booking's status.
- Guard: 2nd no-show ⇒ case auto-`CANCELLED` (abuse control); coach must re-submit to start a new case.
- `REJECTED` keeps the existing re-submission path (new request row), unchanged from `add-pro-profiles-verification`.

Existing `VerificationStatus` (`PENDING/APPROVED/REJECTED`) is replaced by the new state enum in a data migration: `PENDING → AWAITING_SCHEDULING`, `APPROVED → VERIFIED`, `REJECTED → REJECTED`.

### 2. Slot vs Booking as separate tables; double booking prevented twice

`VerificationSlot(startsAt, endsAt, status OPEN|BOOKED|REMOVED)` and `VerificationBooking(slotId @unique, requestId, status, googleEventId?, meetUrl?, googleSyncStatus, reminder24hSentAt?, reminder1hSentAt?)`.

Booking runs in one transaction:
1. `UPDATE "VerificationSlot" SET status='BOOKED' WHERE id=$1 AND status='OPEN'` — zero rows ⇒ 409 (slot just taken; client refreshes list).
2. Insert booking; the `@unique(slotId)` constraint is the hard guarantee even under code bugs.

Slot listing returns only `OPEN` slots with `startsAt > now() + 2h` (minimum notice so admins aren't ambushed) — booked slots vanish from the list transactionally, satisfying "unavailable immediately".

Alternative considered — TTL "hold" while the coach confirms: rejected as overkill; conditional update + 409-with-refresh is enough at this volume.

### 3. Meetings: `MeetingProvider` port, Google adapter, async outbox-style sync

`MeetingProvider { create(booking): {externalId, joinUrl}; update(externalId, times); cancel(externalId) }`.

Google adapter: service account with domain-wide delegation impersonating a platform Workspace account (e.g. `verify@playwithpro.com`); `calendar.events.insert` with `conferenceDataVersion=1` (generates the Meet link), coach as attendee, `sendUpdates: 'all'`. Requirements on the Workspace side: Meet setting allowing external/anonymous participants to knock and be admitted — that is what makes "no Google account required" true; guests join from the browser and the admin admits them.

Sync is asynchronous: booking commits first with `googleSyncStatus=PENDING`; a post-commit hook attempts sync; a cron retries `FAILED/PENDING` rows with backoff. UI shows "meeting link appears shortly" until `meetUrl` is set; admins see failed syncs in the bookings tab. Reschedule uses `events.patch` on the stored `googleEventId` — same event, same Meet link, no calendar duplicates. Cancel uses `events.delete` (best-effort).

Alternative considered — Jitsi (`meet.jit.si/pwp-verify-<id>`): zero API, zero accounts, deterministic URL. Not chosen because admins live in Google Calendar and the brief requires it, but the port makes the swap a one-class change.

### 4. Reminders: cron polling over Postgres, no queue

`@nestjs/schedule` cron (every minute): `WHERE booking.status='SCHEDULED' AND startsAt <= now()+'24h' AND reminder24hSentAt IS NULL` → send, stamp. Same for 1 h. Idempotent via the stamp columns, survives restarts, catches up after downtime (window keys off `startsAt`, not the exact minute). No Redis/BullMQ: at verification volumes a poll is simpler, and the stamps make double-send impossible. All mailer sends stay best-effort (existing pattern), but reminder stamps are written only after a successful send attempt loop.

### 5. Emails link to the authenticated page, not magic links

Reschedule/cancel links point to `/dashboard/verification`; the platform has full auth and the coach's email is already verified. Magic tokens rejected: a forwarded email must not let a stranger cancel a meeting. Confirmation email attaches an `.ics` (METHOD:REQUEST, organizer = platform calendar) so coaches on Outlook/Apple get a native calendar entry despite having no Google account. Every meeting email includes date, time, explicit timezone (coach's `User.timezone`), Meet link, reschedule + cancel links.

### 6. Reschedule = atomic rebook

Coach picks the new slot first; one transaction: new slot conditional-update to `BOOKED`, old booking → `RESCHEDULED`, old slot → `OPEN`, new booking row created (inherits `googleEventId`/`meetUrl`; sync patches the event). The coach is never left slotless mid-flow. Reschedule/cancel cutoff: allowed until 1 h before start; later, only the admin can act (no-show or admin reschedule).

### 7. Contacts removed, privacy note stays

`contactTelegram`/`contactPhone` columns, form fields, admin display, the `callRequestedAt` action and `sendVerificationCallEmail` are all removed — scheduling supersedes them; the platform email is the only required channel. Any admin-only personal data shown in verification UI keeps the existing note "visible to admins only, never published".

### 8. Timezones

Storage: UTC (`timestamptz` via Prisma `DateTime`). Display: viewer's browser timezone by default with an explicit "Times shown in <tz>" label and override; emails use `User.timezone`. Slot picker groups by day in the viewer's timezone (a slot may fall on a different calendar day than in the admin's timezone — grouping happens client-side after conversion).

## Risks / Trade-offs

- [Google sync fails or Workspace policy blocks anonymous guests] → Booking never depends on it; retry cron + admin visibility; `.ics` + our own Meet-link surfaces cover the coach. Workspace Meet settings are a deploy checklist item.
- [Race on popular slots frustrates coaches] → 409 handled client-side with an instant list refresh and a toast; conditional update keeps the window to milliseconds.
- [Cron double-send after crash between send and stamp] → Worst case is one duplicate email; acceptable vs. adding a transactional outbox for mail.
- [Dropping contact columns loses data for in-flight requests] → Migration only drops after the manual-call flow is retired; pending requests are migrated to `AWAITING_SCHEDULING` and coaches book like everyone else.
- [Shared slot pool, multiple admins] → Any admin can take any booking; per-reviewer calendars are a non-goal until it hurts.

## Migration Plan

1. Prisma migration: new tables + state enum, data-migrate `VerificationRequest.status` → `state`, drop contact columns and `callRequestedAt`.
2. Ship API + cron behind nothing (no flag): old flow's endpoints for "call requested" are removed in the same release as the new UI.
3. Env: `GOOGLE_SA_KEY` (JSON), `GOOGLE_CALENDAR_ID`, `GOOGLE_IMPERSONATE_SUBJECT`; deploy checklist includes Workspace Meet guest settings.
4. Rollback: revert deploy; new tables are additive, the enum/data migration has a down script mapping states back.

## Open Questions

- Slot duration policy: fixed 15 min platform-wide vs. admin-chosen per batch — leaning admin-chosen with a 15-min default.
- Should the pending `add-pro-profiles-verification` change be archived before this lands (its `pro-verification` spec is the base for this delta)? Assumed yes.
