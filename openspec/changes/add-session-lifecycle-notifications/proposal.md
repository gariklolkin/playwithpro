## Why

After a player pays, the platform goes almost silent. The API sends exactly two session emails — the same `.ics` invite to both parties on payment and the same CANCEL on a pre-start cancellation — both hard-coded English with UTC times, through a mailer that swallows SMTP failures. Nothing is sent for reminders, the confirmation deadline (48 h auto-confirm releases money by default), disputes (admins learn about them by opening the queue), payouts, refunds, reviews or a changed clip set. Missed sessions cost money and trust, the confirmation window only works if players know about it, and five locales are a product promise the emails break (GitHub issue [#5](https://github.com/gariklolkin/playwithpro/issues/5)). Issues #4, #6, #8, #9 and #10 all defer their emails to the infrastructure this change builds.

## What Changes

- **A transactional outbox for session emails.** A `Notification` table (kind, session, recipient, unique dedupe key, due time, status `pending | sent | failed | skipped`, attempts, last error) is the exactly-once guard. Event-driven rows are inserted in the same transaction as the state change; clock-driven rows by a minute scan; a dispatcher cron sends due rows in small batches, re-checks the session state first, retries failures with backoff up to 5 attempts, and never fails or reverts a payment, cancellation, dispute or review action.
- **Eleven session events, role-specific.** Booking paid (player receipt + coach "new booking" with clip count, each with its own `.ics`), clips changed (coach, debounced 15 min), reminders T-24h and T-1h (both parties), session ended (player "confirm or report a problem" with the deadline, coach "confirm it took place"), session completed (player "released" + review request, coach payout), dispute opened (player receipt, coach hold notice, admin alert), dispute resolved (both, when the payment leaves `HELD`), cancelled before start (who cancelled, refund, CANCEL `.ics`; admin heads-up when the coach cancelled), review received (coach). Events 10–11 of the issue (attendance outcomes, reschedules) are templates only; their triggers belong to the no-show and cancellation-policy changes.
- **Localized mail layer on the API.** ICU message catalogs in en/fr/de/ru/zh for every email (subject, text, HTML, `.ics` summary/description), rendered at send time with the recipient's current locale and timezone; links point at the recipient's locale; amounts in the locale's currency format; free text written by the other party never appears in an email. The existing auth, verification, scheduling and calendar emails move onto the same layer, so a user never gets a mix of localized and English mail. A catalog-completeness test fails on missing keys.
- **Preferences and unsubscribe.** Transactional emails are always sent. Reminders, clip changes and review received are optional, on by default, toggled in a new **Notifications** tab of the settings dialog; those emails carry a signed one-click unsubscribe link and `List-Unsubscribe` / `List-Unsubscribe-Post` headers (RFC 8058).
- **Calendar updates.** Role-specific localized invite emails in the recipient's timezone; `Session.calendarSequence` replaces the hard-coded 0/1 so a future time change can send an updated REQUEST; `CalendarProvider` gains `sendUpdate`.
- **Provider budget.** Sends are counted per UTC day; a warning is logged at 80 % of `EMAIL_DAILY_LIMIT` (default 300, Brevo free plan); at the limit optional emails are marked `skipped` (never queued into the next day) while auth codes, then money/dispute/cancellation emails keep priority.

## Capabilities

### New Capabilities

- `session-notifications`: the event table (events, recipients, timing), outbox delivery guarantees, localized rendering rules, preferences and unsubscribe, the daily budget.

### Modified Capabilities

- `calendar-invites`: role-specific localized invite emails in the recipient's timezone, a stored event sequence and calendar updates.
- `booking`: cancellation and clip-change notifications emitted by the booking flows.
- `session-confirmation`: session-ended prompt and payout notifications.
- `disputes`: opened and resolved notifications, admin alert.
- `reviews`: coach notified of a new review; review request after payout.
- `user-accounts`: email preferences and the Notifications tab.
- `verification-scheduling`: verification emails rendered by the localized layer.
- `i18n`: API-side email catalogs with the same completeness guarantee.

## Impact

- **Database:** `Notification` table; `User.emailReminders`, `emailClipChanges`, `emailReviews` (booleans, default true), `User.unsubscribeSecret`-free design (HMAC over user id with a server secret instead); `Session.calendarSequence Int @default(0)`; `Session.videosChangedAt` for the debounce. Additive migration.
- **API:** new `notifications` module (`NotificationsService` enqueue API, `NotificationScanService` cron, `NotificationDispatchService` cron, `EmailRenderer` + catalogs, `EmailDailyBudget`), `MailerService.deliver()` that throws (the swallowing `send` stays for callers that want best-effort), `GET/PATCH /users/me/notifications`, `POST /notifications/unsubscribe` (signed token, no auth), hooks in `BookingsService` (pay, cancel), `SessionVideosService.replace`, `SettlementService`, `DisputesService`, `ReviewsService`, `SessionProgressionService` (ended). `env.validation.ts`: `EMAIL_DAILY_LIMIT`, `NOTIFY_UNSUBSCRIBE_SECRET`. New dependency `intl-messageformat` (already in the workspace via next-intl).
- **Web:** settings dialog gains a `notifications` tab (three toggles); `/unsubscribe` confirmation page; keys `settings.notifications.*`, `unsubscribe.*` ×5.
- **Infra:** `env.example` gains the two variables; README notes the Brevo cap and the priority order.
- **Non-goals (explicit):** attendance-based outcome rules (#4), cancellation cutoffs and rescheduling (#6), new-message emails (#9), earnings statements (#11), account-deletion emails (#8), an in-app notification center, web push, SMS or messengers, marketing digests, Google Calendar API sync, ops alerting for stuck payments, a paid Brevo plan.
