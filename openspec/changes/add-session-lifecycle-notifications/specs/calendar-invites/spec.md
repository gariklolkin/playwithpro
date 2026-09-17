## MODIFIED Requirements

### Requirement: Invite dispatch on payment success
When a session reaches `paid_escrow`, the system SHALL send each party a role-specific, localized calendar invite email in the recipient's locale and timezone (the player's receipt, the coach's new-booking notice), each carrying an `.ics` invite for the same event UID. For online services (`video_analysis`, `consultation`) the invite SHALL point at the platform session-room URL; for `game` it SHALL carry the coach's venue address and no video-room link. Dispatch SHALL be idempotent per session and recipient through the notification outbox (retried or repeated payment processing SHALL NOT produce duplicate invites) and SHALL NOT affect the payment outcome — a send failure is retried while the session remains paid.

#### Scenario: Online session invite links the room
- **WHEN** a consultation session is paid
- **THEN** both parties receive an `.ics` invite whose location/link is the platform session-room URL

#### Scenario: Game session invite carries the venue
- **WHEN** a `game` session is paid
- **THEN** both parties receive an `.ics` invite carrying the venue address and no video-room link

#### Scenario: Invite failure does not fail payment
- **WHEN** invite emailing fails after a successful payment
- **THEN** the session remains `paid_escrow` and the send is retried later

#### Scenario: No duplicate invites
- **WHEN** payment processing for an already-invited session is repeated
- **THEN** no second invite email is sent

#### Scenario: Invite in the recipient's language and timezone
- **WHEN** a French player in Paris pays a session with a German coach in Berlin
- **THEN** the player's invite email is French with Paris times and the coach's is German with Berlin times

### Requirement: Cancellation update after invite delivery
If a session is cancelled after its invite was sent, the system SHALL send both parties a localized calendar cancellation (method CANCEL) referencing the same UID with a sequence higher than the last invite or update, so calendar clients remove or mark the event cancelled; the email SHALL say who cancelled and that the player was refunded. Sessions cancelled before any invite was sent SHALL NOT trigger a cancellation email.

#### Scenario: Cancelled paid session revokes the event
- **WHEN** a session with a delivered invite is cancelled by the coach
- **THEN** both parties receive a cancellation referencing the original event UID that names the coach as the cancelling party

#### Scenario: Unpaid expiry sends nothing
- **WHEN** a `pending_payment` session expires before any invite was sent
- **THEN** no cancellation email is sent

## ADDED Requirements

### Requirement: Calendar update with a stored sequence
Each session SHALL store its calendar event sequence, starting at 0 for the invite. The calendar provider SHALL offer an update operation that sends both parties a REQUEST for the same UID with an incremented sequence when the session's time changes, so calendar clients replace the event instead of duplicating it. The cancellation SHALL use the sequence following the latest invite or update.

#### Scenario: Time change replaces the event
- **WHEN** a session's time is changed by a later capability and the update is sent
- **THEN** both parties receive a REQUEST with the same UID and a higher sequence

#### Scenario: Cancellation after an update
- **WHEN** a session that received an update is cancelled
- **THEN** the CANCEL carries a sequence higher than the update's
