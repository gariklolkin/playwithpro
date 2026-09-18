## ADDED Requirements

### Requirement: Verification call withdrawn at a deletion request
Accepting a coach's deletion request SHALL withdraw a scheduled verification call as if the coach had withdrawn it: the booking is cancelled, the slot reopened, the calendar event deleted, and the admins notified.

#### Scenario: Scheduled call cancelled
- **WHEN** a coach with a call scheduled for tomorrow requests deletion
- **THEN** the booking is cancelled and its calendar event removed
