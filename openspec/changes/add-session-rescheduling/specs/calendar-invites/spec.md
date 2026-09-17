## ADDED Requirements

### Requirement: Calendar update on a time change
When a reschedule is accepted, the system SHALL send each party a localized email in their locale and timezone stating the previous and the new time, carrying an `.ics` invite (method REQUEST) for the same event UID with a sequence number higher than every earlier invite, so calendar clients move the existing event instead of creating a second one. Dispatch SHALL go through the notification outbox (idempotent per acceptance and recipient, retried on failure) and the `CalendarProvider` abstraction. Session reminders SHALL be re-armed for the new time, including when a reminder for the previous time was already sent.

#### Scenario: Event moves in the calendar
- **WHEN** a reschedule is accepted
- **THEN** both parties receive a REQUEST for the same UID with a higher sequence and the new start and end

#### Scenario: Reminder for the new time
- **WHEN** a session whose 24-hour reminder was already sent is moved to next week
- **THEN** a 24-hour reminder is sent again before the new start

#### Scenario: Cancellation still outranks the update
- **WHEN** a rescheduled session is later cancelled
- **THEN** the cancellation's sequence is higher than the update's
