## ADDED Requirements

### Requirement: Availability withdrawn at a deletion request
Accepting a coach's deletion request SHALL delete their availability rules and mark their future open slots removed; booked slots and past slots SHALL stay as they are. Cancelling the deletion SHALL NOT restore them.

#### Scenario: Slots removed
- **WHEN** a coach with open slots next week requests deletion
- **THEN** those slots are removed while their booked slots stay booked
