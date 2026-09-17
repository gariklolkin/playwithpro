## 1. Data model and mail layer

- [x] 1.1 Prisma: `Notification` model (kind enum, sessionId?, recipientId, unique dedupeKey, dueAt, status, attempts, lastError, sentAt, payload Json), `User.emailReminders/emailClipChanges/emailReviews` (default true), `Session.calendarSequence` (0), `Session.videosChangedAt`; migration `add_notifications`
- [x] 1.2 `env.validation.ts`: `EMAIL_DAILY_LIMIT` (300), `NOTIFY_UNSUBSCRIBE_SECRET` (dev default); `env.example` + root `.env.example`
- [x] 1.3 `MailerService.deliver()` (throws, text + html + headers + attachments) with `send()` kept as the best-effort wrapper; no recipient address in error logs
- [x] 1.4 `notifications/messages/{en,fr,de,ru,zh}.json` ICU catalogs for every session, auth, verification and scheduling email (subject, lines, ics summary/description, common block); `EmailRenderer` (intl-messageformat, locale dates/money, locale-prefixed links, HTML wrapper, unsubscribe line); jest completeness test over the five catalogs

## 2. Outbox

- [x] 2.1 `NotificationsService.enqueue(kind, { sessionId, recipients, dueAt, payload }, tx?)` with `createMany skipDuplicates`; kind → recipient/preference/transactional metadata table
- [x] 2.2 `NotificationScanService` (minute cron, guarded): reminders T-24h/T-1h (skip a window already open at payment), session ended, completed (payment RELEASED + completed_paid), dispute resolved (payment settled + resolved); 7-day lookback cutoff
- [x] 2.3 `NotificationDispatchService` (minute cron): claim by conditional update, `stillApplies` per kind, preference check, budget check, render, `deliver`, backoff 1/5/15/60/240 min, FAILED after 5; unit tests with a fake mailer
- [x] 2.4 `EmailDailyBudget`: sent-today count (outbox rows + direct sends), 80 % warning once per day (log + ERROR_REPORTER), optional kinds skipped at the limit

## 3. Events

- [x] 3.1 Booking paid: enqueue `session.paid.player` / `session.paid.coach` in the pay transaction (replaces `sendInviteOnce`'s direct send; `inviteSentAt` stamped at enqueue); dispatch builds the role-specific `.ics` via `CalendarProvider` (per-attendee locale/timezone/role, stored `calendarSequence`)
- [x] 3.2 Cancel before start: `session.cancelled.player/coach` (+ `session.cancelled.admin` per admin when the coach cancelled) in the cancel transaction, CANCEL `.ics` with sequence+1; `CalendarProvider.sendUpdate` implemented for the future time change
- [x] 3.3 Clips changed: `SessionVideosService.replace` stamps `videosChangedAt` and upserts one `session.clipsChanged` row due in 15 min (paid sessions only)
- [x] 3.4 Disputes: opened → player receipt, coach hold, admin alerts (same transaction); resolved → both parties via the scan once the payment settled
- [x] 3.5 Reviews: `ReviewsService.create` enqueues `review.received` for the coach (rating only)
- [x] 3.6 Existing emails on the new layer: auth verification code + password reset, verification approved/rejected, scheduling confirmed/rescheduled/reminder/cancelled-by-admin/no-show/coach-cancelled notice; `IcsCalendarProvider` and `SchedulingNotificationsService` reduced to adapters; old `sendXxxEmail` methods kept only as thin wrappers over `EmailRenderer` (no inline copy left)

## 4. Preferences and unsubscribe

- [x] 4.1 API: `GET/PATCH /users/me/notifications` (three booleans), `POST /notifications/unsubscribe` (signed token `userId.category.exp` + HMAC, throttled, no auth), `List-Unsubscribe` / `List-Unsubscribe-Post` headers on optional emails
- [x] 4.2 Web: `notifications` settings tab (three toggles, saved on change), `/unsubscribe` page posting the token and confirming; `SETTINGS_TABS` + user-menu/sidebar unchanged; keys `settings.notifications.*`, `unsubscribe.*` ×5; vitest for the tab and the page
- [x] 4.3 Shared types: `NotificationPreferencesResponse`, `UpdateNotificationPreferencesRequest`

## 5. Verification

- [x] 5.1 Unit: renderer (locale/timezone/money, links), dispatcher (dedupe, retry/backoff, skip rules, preferences, budget), scan windows, token sign/verify
- [x] 5.2 e2e (settlement + booking suites): pay → exactly two `session.paid.*` rows, repeated pay adds none; end → `session.ended.*`; confirm → `session.completed.*` only after RELEASED; dispute open → coach + admin rows without the reason; cancel by coach → admin row; clips replaced 3× → one pending `clipsChanged`; unsubscribe token flips the flag; dispatcher with a failing mailer leaves rows pending and money untouched
- [x] 5.3 Lint, tsc, api unit + e2e, web vitest green; Mailpit smoke in dev: a `de` player and a `ru` coach book → both inboxes localized with their zones
- [ ] 5.4 Roadmap entry 26 in `openspec/project.md`; archive after staging verification
