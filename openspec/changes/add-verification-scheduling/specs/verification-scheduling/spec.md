# verification-scheduling — delta for add-verification-scheduling

## ADDED Requirements

### Requirement: Slot publication
Admins SHALL be able to publish verification slots — individually or as a recurring batch (date range, daily time window, slot duration) — and remove slots. Removing an `OPEN` slot takes effect silently; removing a `BOOKED` slot requires confirmation and triggers the admin-cancellation flow for its booking.

#### Scenario: Batch publication
- **WHEN** an admin publishes "Mon–Fri next week, 10:00–12:00, 15-minute slots" in their timezone
- **THEN** the corresponding slots are created with UTC timestamps and appear to coaches as `OPEN`

#### Scenario: Removing a booked slot
- **WHEN** an admin removes a slot that a coach has booked
- **THEN** the admin is asked to confirm, the booking is cancelled as admin-cancelled, and the coach is notified to pick a new time

### Requirement: Slot listing in the viewer's timezone
A coach with a verification request in `AWAITING_SCHEDULING` SHALL see open slots grouped by day in their own timezone (browser timezone by default, with the active timezone labeled). Slots starting less than 2 hours from now SHALL NOT be offered. All timestamps are stored in UTC.

#### Scenario: Timezone grouping
- **WHEN** a coach in UTC+10 views a slot stored as 23:00 UTC Monday
- **THEN** the slot is shown under Tuesday 09:00 with the timezone labeled

#### Scenario: Minimum notice
- **WHEN** a slot starts 90 minutes from now
- **THEN** it is not shown in the coach's slot list

### Requirement: Race-safe booking
A coach SHALL book exactly one slot per verification request. Booking SHALL be transactional: the slot flips `OPEN → BOOKED` with a conditional update and the booking row holds a unique reference to the slot, so a slot can never be double-booked. A booked slot disappears from all coaches' lists immediately.

#### Scenario: Successful booking
- **WHEN** a coach confirms an `OPEN` slot
- **THEN** the slot becomes `BOOKED`, the request moves to `SCHEDULED`, and a confirmation email is sent

#### Scenario: Concurrent booking
- **WHEN** two coaches confirm the same slot at the same time
- **THEN** exactly one booking succeeds and the other receives a conflict response prompting a refreshed slot list

### Requirement: Meeting creation without requiring a Google account
After booking, the system SHALL create a calendar event with a Google Meet link on a platform-owned calendar via a provider interface, invite the coach by email, and store the external event id and Meet URL in the marketplace database. The coach SHALL NOT need a Google account: the Meet URL is always available on the verification page, on the profile verification card, and in every meeting email. The database is the source of truth; provider sync is asynchronous, retried on failure, and never blocks or reverts a booking.

#### Scenario: Provider outage during booking
- **WHEN** the calendar provider is unavailable at booking time
- **THEN** the booking still succeeds, the UI shows that the meeting link will appear shortly, and a retry later populates the event id and Meet URL

#### Scenario: Meet link surfaces
- **WHEN** a coach with no Google account opens the verification page, their profile, or any meeting email
- **THEN** the same working Meet URL is present in each place

### Requirement: Confirmation and reminder emails
The system SHALL email the coach a booking confirmation with an `.ics` calendar attachment, and reminders 24 hours and 1 hour before the meeting. Every meeting email SHALL include the date, time, the coach's timezone, the Meet link, and reschedule and cancel links that lead to the authenticated verification page. Reminders SHALL be idempotent (sent at most once per booking per window) and survive service restarts.

#### Scenario: Reminder idempotency
- **WHEN** the reminder job runs repeatedly within the 24-hour window for the same booking
- **THEN** exactly one 24-hour reminder is sent

#### Scenario: Confirmation content
- **WHEN** a coach books a slot
- **THEN** the confirmation email contains date, time, timezone, Meet link, reschedule link, cancel link, and an `.ics` attachment

### Requirement: Rescheduling as atomic rebook
A coach SHALL be able to reschedule until 1 hour before the meeting by picking a new slot first; in one transaction the new slot is booked, the previous booking is marked rescheduled, and the previous slot returns to `OPEN`. The provider event SHALL be updated in place (same event id, same Meet link) rather than duplicated.

#### Scenario: Successful reschedule
- **WHEN** a coach reschedules from slot A to slot B
- **THEN** slot A is `OPEN` again, slot B is `BOOKED`, the calendar event keeps its id and Meet link with new times, and the coach receives a reschedule email

#### Scenario: Reschedule cutoff
- **WHEN** a coach attempts to reschedule 30 minutes before the meeting
- **THEN** the request is rejected and the UI directs them to contact support / wait for the admin

### Requirement: Cancellation by either party
A coach SHALL be able to cancel their booking (returning the request to `AWAITING_SCHEDULING` and reopening the slot) or withdraw the request entirely (`CANCELLED`). An admin SHALL be able to cancel any booking. In all cases the slot reopens, the provider event is cancelled best-effort, and the other party is notified by email.

#### Scenario: Admin cancels
- **WHEN** an admin cancels a coach's booking
- **THEN** the slot reopens, the request returns to `AWAITING_SCHEDULING`, and the coach receives an email asking to pick a new time

#### Scenario: Coach cancels booking only
- **WHEN** a coach cancels the meeting but not the request
- **THEN** the slot reopens and the request returns to `AWAITING_SCHEDULING` with slot selection available

### Requirement: Verification meeting state machine
A verification request SHALL move through explicit states: `AWAITING_SCHEDULING → SCHEDULED → IN_PROGRESS → VERIFIED | REJECTED`, with terminal `CANCELLED`. No-show and admin cancellation are booking outcomes that return the request to `AWAITING_SCHEDULING`; each booking attempt is preserved as an audit record with its outcome. A second no-show SHALL automatically move the request to `CANCELLED`, requiring re-submission.

#### Scenario: No-show returns to scheduling
- **WHEN** an admin marks a first no-show
- **THEN** the booking is recorded as `NO_SHOW`, the request returns to `AWAITING_SCHEDULING` with an explanatory banner, and the coach is emailed

#### Scenario: Second no-show
- **WHEN** an admin marks a coach's second no-show
- **THEN** the request becomes `CANCELLED` and the coach must submit a new verification request

#### Scenario: Approval from the call
- **WHEN** an admin starts the meeting (`IN_PROGRESS`) and then approves
- **THEN** the booking is `COMPLETED`, the request is `VERIFIED`, and the profile becomes `verified`

### Requirement: Admin bookings management
Admins SHALL see upcoming and past bookings (today first) with coach summary, local times, the Meet link, and actions: start, approve, reject, mark no-show, reschedule, cancel. Failed provider syncs SHALL be visible with a manual retry.

#### Scenario: Start and resolve
- **WHEN** an admin opens today's booking and clicks start
- **THEN** the request shows `IN_PROGRESS` and only approve, reject, and no-show actions remain

#### Scenario: Failed sync visibility
- **WHEN** event creation has failed for a booking
- **THEN** the booking is flagged in the admin list with a retry action
