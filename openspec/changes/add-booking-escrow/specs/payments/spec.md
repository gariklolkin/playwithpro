## ADDED Requirements

### Requirement: PaymentProvider abstraction with escrow semantics
The system SHALL access payments only through a `PaymentProvider` port exposing escrow operations `hold`, `release`, and `refund`; business logic MUST NOT depend on a concrete vendor. The MVP SHALL ship a mock provider whose `hold` succeeds instantly and returns a provider reference, with a development-visible way to simulate a declined hold so the failure path is testable end-to-end. `release` and `refund` SHALL be implemented by the mock but not exposed through the API in this change.

#### Scenario: Hold through the port
- **WHEN** a payment is initiated for a session
- **THEN** the system invokes `hold` on the configured provider and stores the returned provider reference

#### Scenario: Simulated decline
- **WHEN** a payment is initiated with the mock decline option engaged
- **THEN** `hold` fails, the payment is recorded as failed, and the session does not reach `paid_escrow`

### Requirement: Escrow hold on payment
Paying for a session in `pending_payment` SHALL, within one atomic operation: verify the payment deadline has not passed and the session is unpaid, invoke the provider `hold` for the snapshotted amount, record the payment, and move the session to `paid_escrow`. Amounts SHALL always be handled as integer minor units with an ISO 4217 currency code. A session SHALL never be paid twice, and only the session's player MAY pay for it.

#### Scenario: Successful escrow hold
- **WHEN** the player pays a `pending_payment` session before the deadline
- **THEN** funds are held with the provider, a payment record stores the amount, currency, and provider reference, and the session becomes `paid_escrow`

#### Scenario: Double payment prevented
- **WHEN** a pay request arrives for a session already in `paid_escrow`
- **THEN** the request is rejected with a conflict and no second hold is made

#### Scenario: Failed hold leaves session payable
- **WHEN** the provider declines the hold before the deadline
- **THEN** the payment attempt is recorded as failed and the session remains in `pending_payment` for a retry

#### Scenario: Non-party payment attempt
- **WHEN** a user other than the session's player attempts to pay
- **THEN** the request yields not-found

### Requirement: Payment audit records
The system SHALL persist every payment attempt with its session, provider, provider reference, amount in minor units, currency, platform fee snapshot, status (`requires_hold → held | failed`, with `released` and `refunded` reserved for later changes), and timestamps, forming an audit trail that supports future payout and dispute flows.

#### Scenario: Audit trail of a retried payment
- **WHEN** a hold fails and the player retries successfully
- **THEN** two payment records exist for the session — one failed, one held — each with its own timestamps and provider data
