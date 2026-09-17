## MODIFIED Requirements

### Requirement: Player opens a dispute during the confirmation window
While a session is `awaiting_confirmation`, the player SHALL be able to open a dispute instead of confirming, choosing a required reason category — coach didn't show, coach late or left early, technical problem, or other — with a free-text explanation that is optional except for the "other" category, where it is required. Opening a dispute SHALL move the session to `disputed`, freeze the escrowed payment (no release, auto-confirm stops), and record a dispute of kind `PLAYER_REPORTED` with the session, opener, category, text, and timestamp. A session SHALL have at most one dispute; disputing a session in any other status SHALL be rejected with a conflict. Coach-initiated disputes are out of scope.

#### Scenario: Dispute opened in time
- **WHEN** the player of an `awaiting_confirmation` session opens a dispute with the "coach late or left early" category
- **THEN** the session becomes `disputed`, the payment stays held, and the dispute record stores kind `PLAYER_REPORTED` and the category

#### Scenario: Dispute after completion rejected
- **WHEN** the player attempts to dispute a session already `completed_paid`
- **THEN** the request is rejected with a conflict and the payout is not reversed

#### Scenario: Category required
- **WHEN** the player submits a dispute without a reason category
- **THEN** the request is rejected with a validation error and the session stays `awaiting_confirmation`

#### Scenario: Other needs an explanation
- **WHEN** the player submits a dispute with the "other" category and no text
- **THEN** the request is rejected with a validation error

#### Scenario: Session already under a system dispute
- **WHEN** the player attempts to open a dispute on a session already `disputed` by a system-opened dispute
- **THEN** the request is rejected with a conflict and the existing dispute is unchanged

### Requirement: Admin dispute resolution
An admin SHALL be able to resolve a `disputed` session by choosing exactly one outcome: release the escrowed payment to the coach (minus the platform fee) or refund it in full to the player. Resolution SHALL move the session to `resolved`, record the outcome, the resolver (the admin, or none for a resolution made by the system or by the player's confirmation of a system-opened dispute), an optional note, and timestamp on the dispute, and transition the payment accordingly. Resolution SHALL be idempotent-safe: a dispute SHALL be resolved at most once whichever actor gets there first, and non-admin users SHALL NOT access dispute resolution.

#### Scenario: Resolved in coach's favor
- **WHEN** an admin resolves a dispute with the release outcome
- **THEN** the session becomes `resolved`, the payment is released to the coach minus the platform fee, and the outcome and admin are recorded

#### Scenario: Resolved in player's favor
- **WHEN** an admin resolves a dispute with the refund outcome
- **THEN** the session becomes `resolved` and the payment is refunded to the player in full

#### Scenario: Double resolution prevented
- **WHEN** an admin attempts to resolve an already-resolved dispute
- **THEN** the request is rejected with a conflict and no second money movement occurs

#### Scenario: Admin and auto-resolution race
- **WHEN** an admin resolves a system-opened dispute at the moment its response deadline is processed
- **THEN** exactly one of the two resolutions is recorded and money moves exactly once

#### Scenario: Non-admin denied
- **WHEN** a non-admin user requests the dispute queue or a resolution action
- **THEN** the request is denied

### Requirement: Admin dispute queue
The system SHALL provide admins a dispute queue listing open disputes with the session's parties, service type, session time, escrowed amount, dispute kind, reason category and text, and opening time, alongside the existing admin verification queue. The queue SHALL be filterable by dispute kind. Each entry SHALL surface the computed attendance summary (first connection per party, overlap minutes, partial flag, classification) above the session's raw attendance evidence (join/connection/leave entries), the coach's response with its time when one exists, the automatic-resolution deadline while one is pending, and the coach's previous no-show count — the number of that coach's earlier `COACH_NO_SHOW` disputes resolved with a refund, automatically or by an admin. Resolved disputes SHALL be visible with their outcome and whether the system, the player's confirmation, or an admin resolved them.

#### Scenario: Admin reviews an open dispute
- **WHEN** an admin opens the dispute queue
- **THEN** open disputes are listed with parties, amounts, kinds, reasons, the attendance summary and raw evidence for each session

#### Scenario: Filter by kind
- **WHEN** an admin filters the queue by `EVIDENCE_GAP`
- **THEN** only disputes of that kind are listed

#### Scenario: Contested no-show
- **WHEN** an admin opens a `COACH_NO_SHOW` dispute the coach responded to
- **THEN** the entry shows the coach's statement, no automatic-resolution deadline, and the coach's previous no-show count

### Requirement: Dispute visibility for the parties
Both parties of a disputed session SHALL see the dispute state on their session surfaces: the session shows `disputed` with the dispute kind, the reason category and text for a player-reported dispute, and, once resolved, the outcome (released to coach or refunded to player). For an open system-opened dispute the player SHALL see that the payment is on hold with the time it will be refunded unless the coach responds (or that an admin will decide, when no automatic resolution is pending), together with the confirm action; the coach SHALL see the attendance evidence, the response deadline, their response once submitted, and the respond action while it is available. Disputes SHALL be visible only to the session's parties and admins.

#### Scenario: Coach sees the dispute
- **WHEN** the coach of a `disputed` session opens the session in their list
- **THEN** they see the disputed status and the player's reason

#### Scenario: Player sees the resolution
- **WHEN** the player views a session whose dispute was resolved with a refund
- **THEN** the session shows `resolved` with the refund outcome

#### Scenario: Player sees the refund countdown
- **WHEN** the player views a session under an open `COACH_NO_SHOW` dispute without a coach response
- **THEN** they see that the coach did not join, that the payment is on hold, and when it will be refunded

#### Scenario: Coach sees the deadline
- **WHEN** the coach views a session under an open `COACH_NO_SHOW` dispute
- **THEN** they see the attendance evidence, the refund deadline, and the respond form

### Requirement: Localized dispute experience
The dispute surfaces — the report-a-problem form with its reason categories, dispute/resolution status on sessions, the system-dispute state with its countdown, the coach's respond form, and the admin dispute queue with its kinds, filter and summary — SHALL render from next-intl catalogs in all five locales with no hard-coded strings, showing times in the viewer's timezone. The fixed note recorded on an automatic resolution SHALL be stored as a code and rendered from the catalogs, not stored as text in one language.

#### Scenario: Localized dispute form
- **WHEN** a player opens the dispute form in any supported locale
- **THEN** the form, its reason categories and its validation messages render from that locale's catalog

#### Scenario: Localized system note
- **WHEN** a Russian-speaking player views a dispute that was refunded automatically
- **THEN** the explanation of the automatic refund is shown in Russian

## ADDED Requirements

### Requirement: System-opened disputes
The system SHALL open a dispute on its own, with no opener, when attendance classification yields `COACH_NO_SHOW`, `NO_ATTENDANCE` or `EVIDENCE_GAP`, and when an in-person game stays without the coach's answer for the configured period; the dispute kind SHALL record which. Opening SHALL use the same conditional `awaiting_confirmation → disputed` transition as a player dispute, atomically with storing the classification, so that auto-confirm and payout stop, at most one dispute exists per session, and a session the player confirmed or disputed in the meantime is left untouched. `COACH_NO_SHOW` and `NO_ATTENDANCE` disputes opened from classification SHALL carry a response deadline a configurable window after opening (default 48 hours); `EVIDENCE_GAP` disputes and game disputes SHALL carry none. Opening SHALL enqueue the existing dispute-opened notifications for the player, the coach and the admins.

#### Scenario: System dispute opened
- **WHEN** a session is classified `COACH_NO_SHOW`
- **THEN** the session becomes `disputed`, the dispute has kind `COACH_NO_SHOW`, no opener, and a response deadline 48 hours ahead, and the payment stays held

#### Scenario: Player was faster
- **WHEN** classification runs for a session the player has just disputed
- **THEN** no system dispute is created and the player's dispute is unchanged

#### Scenario: Evidence gap has no deadline
- **WHEN** a session is classified `EVIDENCE_GAP`
- **THEN** the dispute is opened without a response deadline

### Requirement: Coach response to a system dispute
The coach of a session under an open system-opened dispute SHALL be able to submit exactly one written statement. A statement submitted before the response deadline SHALL cancel the pending automatic resolution and leave the dispute open for an admin. A second statement, a statement on a player-reported or resolved dispute, or a statement by anyone other than the session's coach SHALL be rejected.

#### Scenario: Coach responds in time
- **WHEN** the coach submits a statement on an open `COACH_NO_SHOW` dispute before the deadline
- **THEN** the statement and its time are recorded, the dispute stays open, and no money moves until an admin resolves it

#### Scenario: Second statement rejected
- **WHEN** the coach submits another statement on the same dispute
- **THEN** the request is rejected with a conflict and the first statement is unchanged

#### Scenario: Only the coach may respond
- **WHEN** the player attempts to submit a coach response
- **THEN** the request is denied

### Requirement: Automatic resolution of uncontested no-shows
When the response deadline of an open `COACH_NO_SHOW` or `NO_ATTENDANCE` dispute passes without a coach response, the system SHALL resolve it with the refund outcome — no resolver, a fixed system note — through the same exactly-once resolution and settlement path as an admin resolution, enforced by the periodic sweep (also run at startup). `EVIDENCE_GAP` disputes, game disputes, player-reported disputes and disputes with a coach response SHALL never be resolved automatically. A configuration switch SHALL disable automatic resolution entirely: classification and system disputes still happen, response deadlines are not set, and every case waits for an admin.

#### Scenario: Uncontested coach no-show refunded
- **WHEN** the sweep runs after the response deadline of a `COACH_NO_SHOW` dispute with no coach response
- **THEN** the dispute is resolved with the refund outcome by the system, the session becomes `resolved`, and the payment is refunded exactly once

#### Scenario: Nobody came and nobody responded
- **WHEN** the response deadline of a `NO_ATTENDANCE` dispute passes with no coach response
- **THEN** the payment is refunded to the player

#### Scenario: Evidence gap waits for an admin
- **WHEN** 48 hours pass on an `EVIDENCE_GAP` dispute
- **THEN** the dispute is still open and no money has moved

#### Scenario: Kill switch
- **WHEN** automatic resolution is disabled and a session is classified `COACH_NO_SHOW`
- **THEN** the system dispute is opened without a response deadline and is never resolved automatically
