## MODIFIED Requirements

### Requirement: PaymentProvider abstraction with escrow semantics
The system SHALL access payments only through a `PaymentProvider` port exposing escrow operations `hold`, `release`, and `refund`; business logic MUST NOT depend on a concrete vendor. `release` SHALL accept an optional partial refund amount in minor units, returning that part of the held amount to the payer while releasing the remainder, so an undelivered add-on can be refunded in the same money movement as the coach's payout. The MVP SHALL ship a mock provider whose `hold` succeeds instantly and returns a provider reference, with a development-visible way to simulate a declined hold so the failure path is testable end-to-end. `release` and `refund` SHALL be invoked through business flows — session confirmation and auto-confirm release the hold, dispute resolution releases or refunds it, and pre-start cancellation refunds it — never directly by API clients; the mock implementations succeed instantly and log the movement, including any partial refund.

#### Scenario: Hold through the port
- **WHEN** a payment is initiated for a session
- **THEN** the system invokes `hold` on the configured provider and stores the returned provider reference

#### Scenario: Simulated decline
- **WHEN** a payment is initiated with the mock decline option engaged
- **THEN** `hold` fails, the payment is recorded as failed, and the session does not reach `paid_escrow`

#### Scenario: Release through the port
- **WHEN** a session completes via confirmation or auto-confirm
- **THEN** the system invokes `release` on the configured provider with the payment's provider reference

#### Scenario: Release with a partial refund
- **WHEN** a session with an undelivered recording add-on completes
- **THEN** the system invokes `release` with the add-on amount as the partial refund, and the payment record stores the refunded part

#### Scenario: Refund through the port
- **WHEN** a paid session is cancelled before start or a dispute is resolved in the player's favor
- **THEN** the system invokes `refund` on the configured provider with the payment's provider reference
