## MODIFIED Requirements

### Requirement: User directory
The system SHALL provide admins a paginated user directory listing every account with email, display name, role, registration date, and suspension state, filterable by role and searchable by email or display name (case-insensitive substring). For professional accounts the directory SHALL show the number of late cancellations by that coach over the last 90 days and SHALL flag coaches at or above a configurable threshold (default 3); force-majeure cancellations by an admin SHALL NOT count. The directory SHALL support opening a user detail view showing account basics (email, role, locale, timezone, email verification state, registration date), the linked player or pro profile summary when present including the late-cancellation count and flag, and activity counters (sessions by status, payment attempts). Admins SHALL be notified once when a coach's cancellation brings them to the threshold. The count SHALL NOT be shown publicly.

#### Scenario: Search by email
- **WHEN** an admin searches the directory for a fragment of a user's email
- **THEN** matching users are listed with role, registration date, and suspension state, paginated

#### Scenario: Filter by role
- **WHEN** an admin filters the directory by the professional role
- **THEN** only professional accounts are listed

#### Scenario: User detail
- **WHEN** an admin opens a user's detail view
- **THEN** account basics, the linked profile summary when present, and session/payment counters are shown

#### Scenario: Unreliable coach flagged
- **WHEN** a coach has cancelled three paid sessions late within the last 90 days
- **THEN** the directory and the coach's detail view show the count with a flag, and the admins were notified when the third one happened

### Requirement: Transaction ledger
The system SHALL provide admins a paginated, newest-first ledger of all payment attempts showing amount and currency in integer minor units, platform fee snapshot, status, the part refunded by a partial release (shown as partly refunded), provider and provider reference, timestamps, and the linked session with both parties' display names and, for a cancelled session, its cancellation record (who, when, tier, refund, late flag, waiver, reason), filterable by payment status. Money SHALL move from the admin console only through the two session actions of the admin cancellation requirement; the ledger itself offers no other movement.

#### Scenario: Ledger listing
- **WHEN** an admin opens the transaction ledger
- **THEN** payment attempts are listed newest first with amount, fee, status, provider reference, and the linked session's parties, paginated

#### Scenario: Filter by status
- **WHEN** an admin filters the ledger by the refunded status
- **THEN** only refunded payments are listed

#### Scenario: Partly refunded row
- **WHEN** an admin views the payment of a session cancelled in the partial tier after it settled
- **THEN** the row shows the released status, the partly refunded amount, and that the player cancelled

## ADDED Requirements

### Requirement: Admin cancellation and fee waiver
An admin SHALL be able to cancel any `paid_escrow` session before its start as force majeure with a required reason: the player is refunded in full, the slot reopens, the calendar cancellation and the cancellation emails are sent, the reason is stored, and the cancellation SHALL NOT count as a late cancellation for either party. An admin SHALL also be able to waive the late fee of a cancelled session under the same rules as the coach. Both actions SHALL be refused to non-admins.

#### Scenario: Force majeure
- **WHEN** an admin cancels a paid session two hours before start with the reason "venue closed"
- **THEN** the session is cancelled by the admin with a full refund, the reason is stored, and the coach's late-cancellation count is unchanged

#### Scenario: Reason required
- **WHEN** an admin submits a force-majeure cancellation without a reason
- **THEN** the request is rejected with a validation error

#### Scenario: Admin waiver
- **WHEN** an admin waives the late fee of a session cancelled in the no-refund tier before its original start
- **THEN** the player is refunded in full

#### Scenario: Non-admin denied
- **WHEN** a coach calls the admin cancellation action
- **THEN** the request is denied
