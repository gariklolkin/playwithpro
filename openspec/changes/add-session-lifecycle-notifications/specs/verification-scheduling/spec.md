## MODIFIED Requirements

### Requirement: Confirmation and reminder emails
The system SHALL email the coach a booking confirmation with an `.ics` calendar attachment, and reminders 24 hours and 1 hour before the meeting, rendered by the platform's localized email layer in the coach's interface locale and timezone. Every meeting email SHALL include the date, time, the coach's timezone, the Meet link, and a reschedule link that leads to the authenticated verification page. Reminders SHALL be idempotent (sent at most once per booking per window) and survive service restarts.

#### Scenario: Reminder idempotency
- **WHEN** the reminder job runs repeatedly within the 24-hour window for the same booking
- **THEN** exactly one 24-hour reminder is sent

#### Scenario: Confirmation content
- **WHEN** a coach books a slot
- **THEN** the confirmation email contains date, time, timezone, Meet link, reschedule link, and an `.ics` attachment

#### Scenario: Localized verification email
- **WHEN** a coach whose interface language is French books a slot
- **THEN** the confirmation email is in French with times in the coach's timezone
