## ADDED Requirements

### Requirement: Reschedule history for admins
The ledger row of a session's payment SHALL show the session's reschedule history: for each proposal who proposed it, its status (open, accepted, declined, withdrawn, expired, superseded), the time it was proposed from, the accepted new time when there is one, and when it was created and answered. The history SHALL be read-only.

#### Scenario: Admin reviews a moved session
- **WHEN** an admin views the payment of a session that was rescheduled once after a declined attempt
- **THEN** the row lists the declined proposal and the accepted one with the old and new times
