## ADDED Requirements

### Requirement: Booking policy acknowledgment at checkout
The checkout page SHALL show a short summary of the booking and cancellation policy with a link to the full policy beneath the escrow notice, and paying SHALL record a checkout acknowledgment of the current policy version for that session. A pay request naming an outdated policy version SHALL be refused with `legal_version_outdated`. Booking and paying SHALL be subject to the re-acceptance gate of the legal-documents capability.

#### Scenario: Acknowledgment recorded
- **WHEN** a player pays for a session
- **THEN** an acceptance row with the checkout context, the session and the current policy version exists

#### Scenario: Stale terms block payment
- **WHEN** a player whose terms acceptance is stale tries to pay
- **THEN** the request is refused with `legal_reacceptance_required`
