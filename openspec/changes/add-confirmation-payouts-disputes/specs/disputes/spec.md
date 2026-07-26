# disputes Specification (delta)

## ADDED Requirements

### Requirement: Player opens a dispute during the confirmation window
While a session is `awaiting_confirmation`, the player SHALL be able to open a dispute with a required reason instead of confirming. Opening a dispute SHALL move the session to `disputed`, freeze the escrowed payment (no release, auto-confirm stops), and record a dispute with the session, opener, reason, and timestamp. A session SHALL have at most one dispute; disputing a session in any other status SHALL be rejected with a conflict. Coach-initiated disputes are out of scope for this change.

#### Scenario: Dispute opened in time
- **WHEN** the player of an `awaiting_confirmation` session opens a dispute with a reason
- **THEN** the session becomes `disputed`, the payment stays held, and the dispute record stores the reason

#### Scenario: Dispute after completion rejected
- **WHEN** the player attempts to dispute a session already `completed_paid`
- **THEN** the request is rejected with a conflict and the payout is not reversed

#### Scenario: Reason required
- **WHEN** the player submits a dispute without a reason
- **THEN** the request is rejected with a validation error and the session stays `awaiting_confirmation`

### Requirement: Admin dispute resolution
An admin SHALL be able to resolve a `disputed` session by choosing exactly one outcome: release the escrowed payment to the coach (minus the platform fee) or refund it in full to the player. Resolution SHALL move the session to `resolved`, record the outcome, resolving admin, an optional note, and timestamp on the dispute, and transition the payment accordingly. Resolution SHALL be idempotent-safe: a dispute SHALL be resolved at most once, and non-admin users SHALL NOT access dispute resolution.

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

### Requirement: Admin dispute queue
The system SHALL provide admins a dispute queue listing open disputes with the session's parties, service type, session time, escrowed amount, dispute reason, and opening time, alongside the existing admin verification queue. Each entry SHALL surface the session's attendance evidence (join/leave entries) to inform the decision. Resolved disputes SHALL be visible with their outcome.

#### Scenario: Admin reviews an open dispute
- **WHEN** an admin opens the dispute queue
- **THEN** open disputes are listed with parties, amounts, reasons, and attendance evidence for each session

### Requirement: Dispute visibility for the parties
Both parties of a disputed session SHALL see the dispute state on their session surfaces: the session shows `disputed` with the dispute reason and, once resolved, the outcome (released to coach or refunded to player). Disputes SHALL be visible only to the session's parties and admins.

#### Scenario: Coach sees the dispute
- **WHEN** the coach of a `disputed` session opens the session in their list
- **THEN** they see the disputed status and the player's reason

#### Scenario: Player sees the resolution
- **WHEN** the player views a session whose dispute was resolved with a refund
- **THEN** the session shows `resolved` with the refund outcome

### Requirement: Localized dispute experience
The dispute surfaces — the report-a-problem form, dispute/resolution status on sessions, and the admin dispute queue — SHALL render from next-intl catalogs in all five locales with no hard-coded strings, showing times in the viewer's timezone.

#### Scenario: Localized dispute form
- **WHEN** a player opens the dispute form in any supported locale
- **THEN** the form and its validation messages render from that locale's catalog
