# calendar-invites Specification (delta)

## ADDED Requirements

### Requirement: Calendar invites through provider abstraction
Calendar invitations SHALL be produced through a `CalendarProvider` abstraction so business logic never binds to a vendor. The MVP implementation SHALL send universal `.ics` email invites (RFC 5545, method REQUEST) via the platform mailer; a Google Calendar implementation is deferred to a later change. The invite SHALL use the session's identity as a stable calendar UID and UTC times matching the session's snapshotted start/end.

#### Scenario: ICS invite generated for a paid session
- **WHEN** a session is paid
- **THEN** an `.ics` invite with the session's UTC start/end and a stable UID is produced by the calendar provider

### Requirement: Invite dispatch on payment success
When a session reaches `paid_escrow`, the system SHALL send the calendar invite to both parties' email addresses. For online services (`video_analysis`, `consultation`) the invite SHALL point at the platform session-room URL; for `game` it SHALL carry the coach's venue address and no video-room link. Dispatch SHALL be idempotent per session (retried or repeated payment processing SHALL NOT produce duplicate invites) and SHALL NOT affect the payment outcome — a send failure is logged while the session remains paid.

#### Scenario: Online session invite links the room
- **WHEN** a consultation session is paid
- **THEN** both parties receive an `.ics` invite whose location/link is the platform session-room URL

#### Scenario: Game session invite carries the venue
- **WHEN** a `game` session is paid
- **THEN** both parties receive an `.ics` invite carrying the venue address and no video-room link

#### Scenario: Invite failure does not fail payment
- **WHEN** invite emailing fails after a successful payment
- **THEN** the session remains `paid_escrow` and the failure is logged

#### Scenario: No duplicate invites
- **WHEN** payment processing for an already-invited session is repeated
- **THEN** no second invite email is sent

### Requirement: Cancellation update after invite delivery
If a session is cancelled after its invite was sent, the system SHALL send both parties a calendar cancellation (method CANCEL) referencing the same UID so calendar clients remove or mark the event cancelled. Sessions cancelled before any invite was sent SHALL NOT trigger a cancellation email.

#### Scenario: Cancelled paid session revokes the event
- **WHEN** a session with a delivered invite is cancelled
- **THEN** both parties receive a cancellation referencing the original event UID

#### Scenario: Unpaid expiry sends nothing
- **WHEN** a `pending_payment` session expires before any invite was sent
- **THEN** no cancellation email is sent
