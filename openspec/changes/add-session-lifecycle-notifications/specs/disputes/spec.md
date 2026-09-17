## MODIFIED Requirements

### Requirement: Player opens a dispute during the confirmation window
While a session is `awaiting_confirmation`, the player SHALL be able to open a dispute with a required reason instead of confirming. Opening a dispute SHALL move the session to `disputed`, freeze the escrowed payment (no release, auto-confirm stops), and record a dispute with the session, opener, reason, and timestamp. A session SHALL have at most one dispute; disputing a session in any other status SHALL be rejected with a conflict. Coach-initiated disputes are out of scope for this change. Opening a dispute SHALL enqueue, in the same transaction, a receipt to the player, a "payout on hold" notice to the coach and an alert to every admin linking to the queue; none of these emails SHALL contain the dispute reason.

#### Scenario: Dispute opened in time
- **WHEN** the player of an `awaiting_confirmation` session opens a dispute with a reason
- **THEN** the session becomes `disputed`, the payment stays held, and the dispute record stores the reason

#### Scenario: Dispute after completion rejected
- **WHEN** the player attempts to dispute a session already `completed_paid`
- **THEN** the request is rejected with a conflict and the payout is not reversed

#### Scenario: Reason required
- **WHEN** the player submits a dispute without a reason
- **THEN** the request is rejected with a validation error and the session stays `awaiting_confirmation`

#### Scenario: Opening notifies coach and admins
- **WHEN** a dispute is opened
- **THEN** the coach and all admins receive an email without the reason text, and the player a receipt

### Requirement: Admin dispute resolution
An admin SHALL be able to resolve a `disputed` session by choosing exactly one outcome: release the escrowed payment to the coach (minus the platform fee) or refund it in full to the player. Resolution SHALL move the session to `resolved`, record the outcome, resolving admin, an optional note, and timestamp on the dispute, and transition the payment accordingly. Resolution SHALL be idempotent-safe: a dispute SHALL be resolved at most once, and non-admin users SHALL NOT access dispute resolution. Both parties SHALL be emailed the outcome (refunded or released) once the payment has left `HELD`; the admin note SHALL NOT be included.

#### Scenario: Resolved in coach's favor
- **WHEN** an admin resolves a dispute with the release outcome
- **THEN** the session becomes `resolved`, the payment is released to the coach minus the platform fee, and the outcome and admin are recorded

#### Scenario: Resolved in player's favor
- **WHEN** an admin resolves a dispute with the refund outcome
- **THEN** the session becomes `resolved` and the payment is refunded to the player in full

#### Scenario: Double resolution prevented
- **WHEN** an admin attempts to resolve an already-resolved dispute
- **THEN** the request is rejected with a conflict and no second money movement occurs

#### Scenario: Non-admin denied
- **WHEN** a non-admin user requests the dispute queue or a resolution action
- **THEN** the request is denied

#### Scenario: Outcome emails follow the settlement
- **WHEN** a dispute is resolved and the payment is refunded
- **THEN** the player receives a "refunded" email and the coach a "refunded to the player" email, each once, after the payment row is `REFUNDED`
