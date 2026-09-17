## Context

`MailerService` (nodemailer over Brevo in production, Mailpit in dev) builds English plain-text bodies and swallows every SMTP error; callers cannot know a send failed. Session emails exist only inside `IcsCalendarProvider` (invite + cancel, same body for both parties, UTC `whenLine`, `SEQUENCE` hard-coded 0/1). `RemindersService` polls Postgres every minute for verification-call reminders and stamps `reminder24hSentAt`/`reminder1hSentAt` on `VerificationBooking` — the pattern to generalize. Session progression happens both in sweeps and inline on read paths (`SessionProgressionService.normalize`), so a status transition is not a single hook point. `User` carries `locale` and `timezone`. The web settings dialog has Profile and Security tabs (`SETTINGS_TABS`). `intl-messageformat` is already in the workspace (next-intl's dependency).

Constraints: exactly once per event and recipient; money and status actions never depend on mail; five locales with the same completeness guarantee as the web; Brevo free plan of 300 mails/day; no queue infrastructure (single API instance, Postgres polling like the reminders).

## Goals / Non-Goals

**Goals:** every lifecycle moment that a user expects mail for sends one localized, timezone-correct email; failures retry and are visible; optional mail is unsubscribable in one click; later changes (#4, #6, #8, #9, #10) only add kinds and templates.

**Non-Goals:** the rules behind rows 10–11 of the issue's table, in-app notifications, a queue broker, Google Calendar sync, HTML design beyond a plain single-column template.

## Decisions

1. **Outbox = `Notification` rows; the unique dedupe key is the exactly-once guard.** Columns: `id`, `kind` (enum of the event kinds), `sessionId?`, `recipientId`, `dedupeKey` (`kind:sessionId:recipientId`, unique), `dueAt`, `status` (`PENDING | SENT | FAILED | SKIPPED`), `attempts`, `lastError?`, `sentAt?`, `payload` (JSON scalars the template needs but that are not re-readable at send time, e.g. `cancelledBy`, `outcome`, `hoursBefore`, `ratingHint`), `createdAt`. Event-driven kinds are inserted with `createMany({ skipDuplicates: true })` inside the transaction that flips the state; clock-driven kinds by `NotificationScanService`. *Alternative rejected:* stamps on `Session` per kind (like `inviteSentAt`) — eleven kinds × two recipients would bloat the row and cannot express retries.

2. **Two crons, one dispatcher.** `NotificationScanService` (every minute, guarded like the other sweeps) inserts due clock-driven rows: reminders (sessions `paid_escrow` with `startsAt` inside the 24 h / 1 h window and not already inside it when paid — same rule as `RemindersService`), session ended (`endsAt <= now`, status `awaiting_confirmation`/`completed_paid`/`disputed`/`resolved` — i.e. any post-end status, so a read-path transition is covered), completed (payment `RELEASED` and status `completed_paid`), dispute resolved (payment `RELEASED`/`REFUNDED` and status `resolved`). `NotificationDispatchService` (every minute) claims up to 25 due `PENDING` rows with a conditional `updateMany` to `SENDING`… simplified: it selects due rows, and for each does `updateMany({ where: { id, status: PENDING } , data: { attempts+1 } })` as the claim; re-checks the session state through a per-kind `stillApplies(session)` predicate (`SKIPPED` when a reminder's session was cancelled, or a review request when a review exists); renders; calls `MailerService.deliver` (throws); marks `SENT` or, on error, `PENDING` with `dueAt = now + backoff(attempts)` (1, 5, 15, 60, 240 min) until 5 attempts → `FAILED` + error log. Single instance, so no row lock is needed beyond the conditional update.

3. **Rendering at send time from API-side ICU catalogs.** `apps/api/src/notifications/messages/{en,fr,de,ru,zh}.json`: per kind `subject`, `text` (array of lines joined with newlines) and the `.ics` `summary`/`description`; shared `common` block (greeting, signature, unsubscribe line, deadline formats). `EmailRenderer.render(kind, locale, params)` uses `intl-messageformat` for plurals/dates and wraps the text in a minimal HTML template (one column, no images, one primary link) — `MailerService.deliver` sends both `text` and `html`. Dates come through `Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone })` with the zone name appended; money through `Intl.NumberFormat(locale, { style: 'currency', currency })`. Links: `${WEB_APP_URL}/${localePrefix}/dashboard/sessions` etc. (`en` unprefixed per routing). A jest test flattens the five catalogs and asserts identical key sets and identical ICU placeholders, like the web drift test.

4. **Recipients and evidence rules.** Each kind has a fixed recipient set (player / coach / admins) resolved at enqueue time; admin alerts enqueue one row per admin user. Free text by the other party (dispute reason, admin note, review text, clip notes) is never rendered: the email links to the session, where it is visible. Review received tells the coach the rating only. The coach "new booking" email carries the clip count, not titles.

5. **Existing emails move onto the same layer.** `MailerService` keeps `deliver(to, { subject, text, html, attachments, headers })` and `send` (best-effort, wraps `deliver`); the typed `sendXxxEmail` methods are replaced by `EmailRenderer` kinds: `auth.verificationCode`, `auth.passwordReset`, `verification.approved|rejected`, `verification.booking.confirmed|rescheduled|reminder|cancelledByAdmin|noShow`, `verification.coachCancelledNotice`. These stay direct (not outboxed): auth codes must go now, and the scheduling ones already have their own idempotency. `SchedulingNotificationsService` and `IcsCalendarProvider` become thin adapters that pick the recipient's locale/timezone.

6. **Calendar: role-specific invites, stored sequence, `sendUpdate`.** `CalendarSessionInput` gains per-attendee `locale`, `timezone`, `role`; `IcsCalendarProvider` renders `.ics` summary/description per recipient locale and the email per recipient (receipt vs. new booking). `Session.calendarSequence` starts at 0; `sendCancellation` and the future `sendUpdate` read it, and `sendUpdate` increments it in the same transaction as the time change (used by #6). The invite kinds (`session.paid.player`, `session.paid.coach`) are outbox rows whose dispatch builds the `.ics` — replacing `sendInviteOnce`'s claim; `inviteSentAt` is kept as "the invite row was enqueued" for the cancellation rule.

7. **Preferences and one-click unsubscribe.** `User.emailReminders`, `emailClipChanges`, `emailReviews` (default true) gate the optional kinds at dispatch (checked at send time, so a toggle flipped while a row is pending still wins → `SKIPPED`). Optional emails carry `List-Unsubscribe: <https://…/unsubscribe?token=…>, <mailto:…>`? — mailto is not offered (no inbound mail); the header carries the HTTPS URL only plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The token is `base64url(userId.category.exp).hmac` with `NOTIFY_UNSUBSCRIBE_SECRET`; `POST /notifications/unsubscribe` (no auth, throttled) flips the category off; the web page `/unsubscribe?token=` posts it and confirms, with a link to the settings tab. `GET/PATCH /users/me/notifications` back the settings tab.

8. **Daily budget.** `EmailDailyBudget` counts `Notification` rows sent today (UTC) plus direct sends (a lightweight `EmailSendLog` is avoided: direct sends increment an in-memory counter reset at UTC midnight — precise enough for a warning). At 80 % of `EMAIL_DAILY_LIMIT` a warning is logged (and an error reported through `ERROR_REPORTER`, change 24); at 100 % the dispatcher skips optional kinds (`SKIPPED`, reason `budget`) and keeps transactional ones; direct auth sends are never blocked.

9. **Clip-change debounce.** `SessionVideosService.replace` stamps `Session.videosChangedAt = now` and upserts one `session.clipsChanged` row per session with `dueAt = now + 15 min`; a later replace moves `dueAt` forward (update the pending row) so the coach gets one email after 15 quiet minutes. The dedupe key excludes a timestamp; a `SENT` row is re-created for a new burst by deleting sent `clipsChanged` rows on the next replace.

## Risks / Trade-offs

- [Read-path transitions bypass hooks] → clock-driven kinds are inserted by scanning terminal facts (status + payment status + endsAt), never by hooking the transition.
- [Duplicate emails under concurrency] → unique `dedupeKey` + conditional claim on `status`; verified by e2e (repeated pay, concurrent sweep).
- [SMTP outage] → rows stay `PENDING`, backoff, `FAILED` after 5 with the error visible in the table and logs; money never waits.
- [Brevo cap] → budget + priority + skipping optional mail; the paid plan is a launch-checklist item.
- [Catalog drift across five locales] → jest completeness test mirrors the web one.
- [Unsubscribe token leaks via forwarded mail] → it only turns one optional category off for one user; nothing else.

## Migration Plan

Additive migration (`Notification`, user preference columns, `calendarSequence`, `videosChangedAt`). Deploy API; on first sweep the scan enqueues "session ended"/"completed" rows only for sessions whose `endsAt` is within the last 7 days (cutoff constant) so old history does not trigger a mail storm. Web deploy adds the tab and page. Rollback: previous images; the table can stay.

## Open Questions

None blocking. The T-12h "last chance" email and a payment-window-expired nudge stay out (issue recommendation).
