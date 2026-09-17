## ADDED Requirements

### Requirement: Session lifecycle events and recipients
The system SHALL email the parties of a session at these lifecycle moments, each as a role-specific message: booking paid (player receipt with the amount held in escrow and a calendar invite; coach "new booking" with service, clip count and a calendar invite), clip set changed (coach, one email after 15 minutes without further changes), reminders 24 hours and 1 hour before the slot (both parties; a window already started when the booking was paid is skipped), session ended (player "confirm or report a problem" naming the auto-confirm deadline; coach "confirm it took place"), session completed (player "payment released" plus a review request; coach payout amount minus the platform fee), dispute opened (player receipt; coach "payout on hold"; every admin alerted with a link to the queue), dispute resolved (both parties, once the payment left `HELD`), cancelled before start (both parties: who cancelled, the refund, a calendar cancellation; admins when the coach cancelled), review received (coach: rating and a link). No email SHALL be sent for a payment window expiring. Emails SHALL NOT contain free text written by the other party (dispute reason, admin note, review text, clip notes); they link to the session instead.

#### Scenario: New booking reaches both parties differently
- **WHEN** a video-analysis session is paid
- **THEN** the player receives a receipt with the held amount and the coach a "new booking" email with the clip count, each with a calendar invite

#### Scenario: Reminder skipped for a late booking
- **WHEN** a session is paid 5 hours before its start
- **THEN** only the 1-hour reminder is sent to each party

#### Scenario: Dispute alerts the admins without the reason
- **WHEN** a player opens a dispute
- **THEN** the coach and every admin receive an email that links to the session or queue and carries no dispute text

#### Scenario: Payout email follows the money
- **WHEN** a session completes but the provider release fails and is retried by the sweep
- **THEN** the payout email is sent once the payment row is `RELEASED`, not before

### Requirement: Outbox delivery, exactly once, retried, restart-safe
Session emails SHALL be recorded as notification rows with a unique dedupe key per event, session and recipient before being sent; event-driven rows SHALL be written in the same transaction as the state change, clock-driven rows by a minute scan of session and payment facts, and a dispatcher SHALL send due rows in small batches after re-checking that the event still applies (marking rows skipped otherwise). A failed send SHALL be retried with backoff up to five attempts and then marked failed with the error recorded. A notification failure SHALL NEVER fail or revert a payment, cancellation, dispute or review action, and a restart SHALL neither lose nor duplicate a notification.

#### Scenario: Repeated payment sends one receipt
- **WHEN** the pay request is repeated or the sweep runs concurrently for an already-paid session
- **THEN** exactly one receipt and one new-booking email exist

#### Scenario: SMTP outage
- **WHEN** the SMTP relay is down while notifications are due
- **THEN** the rows stay pending, are retried after the relay recovers, and the sessions' money and status are unaffected

#### Scenario: Reminder for a cancelled session
- **WHEN** a reminder row is due for a session cancelled since it was queued
- **THEN** the row is marked skipped and no email is sent

### Requirement: Localized rendering in the recipient's locale and timezone
Every session email SHALL be rendered at send time from API-side message catalogs in the recipient's current interface locale (en/fr/de/ru/zh), with times in the recipient's timezone and the zone shown, amounts in the locale's currency format, and links pointing at the recipient's locale, as plain text plus a simple single-column HTML version with one primary link. The five catalogs SHALL contain identical key sets and placeholders, enforced by a test.

#### Scenario: German player, Russian coach
- **WHEN** a session between a `de` player in Berlin and a `ru` coach in Moscow is paid
- **THEN** the player's receipt is German with Berlin times and the coach's email Russian with Moscow times

#### Scenario: Missing key fails the build
- **WHEN** a key exists in the English email catalog but not in another
- **THEN** the API unit test suite fails

### Requirement: Preferences and one-click unsubscribe
Reminders, clip-change and review-received emails SHALL be optional, on by default, and switchable per account in the settings dialog; these emails SHALL carry a signed one-click unsubscribe link and `List-Unsubscribe` / `List-Unsubscribe-Post` headers that turn the category off without signing in. Receipts, session-ended prompts, completion/payout, dispute, cancellation and admin emails SHALL always be sent and carry no unsubscribe link.

#### Scenario: One-click unsubscribe
- **WHEN** a recipient uses the unsubscribe link of a reminder
- **THEN** reminders are turned off for that account, the page confirms it, and transactional emails still arrive

#### Scenario: Toggle wins over a pending row
- **WHEN** a user turns clip-change emails off while such a row is pending
- **THEN** the row is skipped at dispatch

### Requirement: Daily send budget
The system SHALL count emails sent per UTC day and log a warning at 80 % of a configurable daily limit (default 300). At the limit, optional emails SHALL be skipped for the rest of the day (never queued into the next day) while sign-in codes, password resets and money, dispute and cancellation emails keep being sent.

#### Scenario: Budget nearly used
- **WHEN** the day's sends reach 80 % of the limit
- **THEN** a warning is logged once

#### Scenario: Budget exhausted
- **WHEN** the limit is reached
- **THEN** a due reminder is marked skipped and a due receipt is still sent
