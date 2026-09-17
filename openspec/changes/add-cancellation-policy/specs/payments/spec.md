## MODIFIED Requirements

### Requirement: PaymentProvider abstraction with escrow semantics
The system SHALL access payments only through a `PaymentProvider` port exposing escrow operations `hold`, `release`, and `refund`; business logic MUST NOT depend on a concrete vendor. `release` SHALL accept an optional refunded part in minor units: the provider releases the held amount minus that part to the coach and returns that part to the player as one operation. The MVP SHALL ship a mock provider whose `hold` succeeds instantly and returns a provider reference, with a development-visible way to simulate a declined hold so the failure path is testable end-to-end. `release` and `refund` SHALL be invoked through business flows — session confirmation and auto-confirm release the hold, dispute resolution releases or refunds it, a free or waived pre-start cancellation refunds it, and a late pre-start cancellation releases it with the refunded part — never directly by API clients; the mock implementations succeed instantly and log the movement.

#### Scenario: Hold through the port
- **WHEN** a payment is initiated for a session
- **THEN** the system invokes `hold` on the configured provider and stores the returned provider reference

#### Scenario: Simulated decline
- **WHEN** a payment is initiated with the mock decline option engaged
- **THEN** `hold` fails, the payment is recorded as failed, and the session does not reach `paid_escrow`

#### Scenario: Release through the port
- **WHEN** a session completes via confirmation or auto-confirm
- **THEN** the system invokes `release` on the configured provider with the payment's provider reference

#### Scenario: Refund through the port
- **WHEN** a paid session is cancelled in the free tier or a dispute is resolved in the player's favor
- **THEN** the system invokes `refund` on the configured provider with the payment's provider reference

#### Scenario: Partial release through the port
- **WHEN** a session cancelled in the partial tier settles
- **THEN** the system invokes `release` once with the payment's provider reference and the refunded part

### Requirement: Payment audit records
The system SHALL persist every payment attempt with its session, provider, provider reference, amount in minor units, currency, platform fee snapshot, status (`requires_hold → held | failed`, then `held → released | refunded`), the part refunded to the player by a partial release (zero or absent otherwise), and timestamps, forming an audit trail that supports payout and dispute flows. Exactly one terminal money movement SHALL be recorded per held payment — a payment SHALL never be both released and refunded by separate movements, and never released or refunded twice.

#### Scenario: Audit trail of a retried payment
- **WHEN** a hold fails and the player retries successfully
- **THEN** two payment records exist for the session — one failed, one held — each with its own timestamps and provider data

#### Scenario: Release recorded once
- **WHEN** a held payment is released after confirmation
- **THEN** the payment record becomes `released` with a timestamp, and a repeated release attempt changes nothing

#### Scenario: Refund recorded
- **WHEN** a held payment is refunded through cancellation or dispute resolution
- **THEN** the payment record becomes `refunded` with a timestamp

#### Scenario: Partial release recorded
- **WHEN** a payment is released with a refunded part
- **THEN** the payment record becomes `released` and stores the refunded part

## ADDED Requirements

### Requirement: Deferred settlement of late cancellations
A full-refund cancellation SHALL settle immediately. A cancellation in the partial or no-refund tier SHALL keep the payment held until the session's original start time, leaving room for a waiver, and SHALL then settle with a single movement — a release with the refunded part, or a plain release when nothing is refunded — enforced by the settlement sweep. A waiver recorded before that moment SHALL turn the settlement into a full refund. Settlement SHALL stay exactly-once under a concurrent cancellation, waiver and sweep: a waiver and a release racing each other SHALL result in exactly one of them, never a release after a recorded waiver.

#### Scenario: Held until the start
- **WHEN** the player cancels in the partial tier 10 hours before start and the sweep runs an hour later
- **THEN** the payment is still held

#### Scenario: Settled at the start
- **WHEN** the sweep runs after the original start time of that session
- **THEN** the payment is released once with the refunded part recorded, and a second sweep changes nothing

#### Scenario: Waiver wins before the start
- **WHEN** the coach waives the fee before the original start time
- **THEN** the payment is refunded in full and is never released

#### Scenario: Waiver and sweep race
- **WHEN** a waiver and the settlement sweep act on the same payment at the original start time
- **THEN** exactly one money movement is recorded, and it is a refund if the waiver was recorded
