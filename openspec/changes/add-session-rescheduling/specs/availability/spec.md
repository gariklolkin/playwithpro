## ADDED Requirements

### Requirement: Slots held by a reschedule proposal
A slot offered in an open reschedule proposal SHALL be held for it: the hold SHALL be taken atomically with the same open-to-booked claim a booking uses, so a held slot is absent from the public open-slot listing, cannot be booked or offered in another proposal, and is kept by slot materialization. The coach's availability dashboard SHALL label such a slot as held for a reschedule. When the proposal closes without choosing the slot, the slot SHALL become open again unless it has been removed or has started; a periodic sweep SHALL release any slot still held by a closed or expired proposal.

#### Scenario: Held slot is not bookable
- **WHEN** another player tries to book a slot offered in an open proposal
- **THEN** the booking is rejected with a conflict

#### Scenario: Hold released on decline
- **WHEN** the proposal is declined
- **THEN** the offered slots reappear in the public open-slot listing

#### Scenario: Sweep cleans up
- **WHEN** a proposal has passed its expiry and the sweep runs
- **THEN** the proposal is marked expired and its slots are open again
