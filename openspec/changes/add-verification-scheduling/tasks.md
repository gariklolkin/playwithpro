# Tasks: add-verification-scheduling

## 1. Data model & migration

- [x] 1.1 Prisma: add `VerificationSlot` (startsAt/endsAt UTC, status OPEN|BOOKED|REMOVED, createdById) and `VerificationBooking` (slotId @unique, requestId, status enum, googleEventId?, meetUrl?, googleSyncStatus, reminder24hSentAt?, reminder1hSentAt?) with indexes `[status, startsAt]`
- [x] 1.2 Prisma: replace `VerificationRequest.status` with `state` enum (AWAITING_SCHEDULING, SCHEDULED, IN_PROGRESS, VERIFIED, REJECTED, CANCELLED) + `noShowCount Int @default(0)`; data-migrate PENDING→AWAITING_SCHEDULING, APPROVED→VERIFIED, REJECTED→REJECTED
- [x] 1.3 Prisma: drop `contactTelegram`, `contactPhone`, `callRequestedAt`; write migration down script; update seed
- [x] 1.4 `packages/shared`: add state/status enums and scheduling DTO types; remove contact fields from verification DTOs

## 2. Scheduling API

- [x] 2.1 `scheduling` module: admin endpoints — create slot(s) (single + batch: date range, daily window, duration), list slots, remove slot (OPEN silently; BOOKED → confirm flag triggers admin-cancel flow)
- [x] 2.2 Coach endpoints: list open slots (`status=OPEN AND startsAt > now()+2h`), book slot — transaction: conditional `OPEN→BOOKED` update (0 rows ⇒ 409) + booking insert; request → SCHEDULED
- [x] 2.3 Reschedule endpoint (atomic rebook: new slot booked, old booking → RESCHEDULED, old slot → OPEN, event id/meet url carried over) with 1-hour cutoff
- [x] 2.4 Cancel endpoints: coach cancel-booking (→ AWAITING_SCHEDULING, slot reopens), coach withdraw (→ CANCELLED), admin cancel (→ AWAITING_SCHEDULING + notify)
- [x] 2.5 Admin state transitions: start (SCHEDULED→IN_PROGRESS), approve (→VERIFIED, profile verified, booking COMPLETED), reject (→REJECTED, note required), no-show (booking NO_SHOW, noShowCount++, →AWAITING_SCHEDULING; 2nd → CANCELLED); guard illegal transitions
- [x] 2.6 Unit tests: booking race (concurrent book → one 409), reschedule atomicity, transition guards, no-show auto-cancel

## 3. Meeting provider (Google)

- [x] 3.1 `MeetingProvider` interface (create/update/cancel) + module wiring; env validation for `GOOGLE_SA_KEY`, `GOOGLE_CALENDAR_ID`, `GOOGLE_IMPERSONATE_SUBJECT`
- [x] 3.2 Google adapter: `googleapis` service-account client with domain-wide delegation; `events.insert` with `conferenceDataVersion=1`, attendee = coach email, `sendUpdates:'all'`; `events.patch` for reschedule; `events.delete` best-effort for cancel
- [x] 3.3 Async sync: post-commit create attempt sets SYNCED/FAILED; cron retries PENDING/FAILED with backoff; store googleEventId + meetUrl on success
- [x] 3.4 Fake provider for dev/tests (deterministic URL); adapter unit tests with mocked googleapis

## 4. Emails & reminders

- [x] 4.1 Mailer: booking confirmation with `.ics` attachment (METHOD:REQUEST, organizer = platform calendar), reschedule, cancel (by-pro / by-admin variants), no-show notice — each with date, time, coach timezone, Meet link, reschedule/cancel links to `/dashboard/verification`; remove `sendVerificationCallEmail`
- [x] 4.2 `@nestjs/schedule` cron (1 min): 24h and 1h reminder queries keyed on `startsAt` window + null stamp; stamp after send; idempotency test
- [x] 4.3 E2E-ish test: book → confirmation sent; advance clock → reminders sent once each

## 5. Web — coach

- [x] 5.1 Verification page: AWAITING_SCHEDULING → slot picker grouped by day in browser timezone (labeled, overridable); book + confirm; 409 → toast + refresh
- [x] 5.2 SCHEDULED card (page + profile): date/time/timezone, Join meeting (or "link appears shortly" while sync pending), Reschedule (picker flow), Cancel (booking vs withdraw); banners for no-show/admin-cancel returns
- [x] 5.3 Remove contact fields from submission form; add "visible to admins only, never published" note where personal data is shown; catalogs ×5

## 6. Web — admin

- [x] 6.1 Slots tab: create single/batch in admin's timezone, list with booked/open state, remove (confirm when booked)
- [x] 6.2 Bookings tab: today-first list, coach summary, Meet link, actions start/approve/reject/no-show/reschedule/cancel; failed-sync badge + retry; catalogs ×5

## 7. Rollout

- [x] 7.1 Deploy checklist: Workspace service account + delegation scopes, calendar, Meet external-guest settings; document in README/infra notes
- [ ] 7.2 Verify full flow on staging with a non-Google email: book → confirmation + .ics → join as anonymous guest → approve; and no-show/reschedule paths
