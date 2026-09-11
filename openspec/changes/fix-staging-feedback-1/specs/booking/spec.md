## ADDED Requirements

### Requirement: Unpaid booking visibility and release
The coach page SHALL show a signed-in amateur their own `pending_payment` session with that coach — its time and the minutes left to pay — with actions to continue to payment and to release the slot. An amateur SHALL be able to cancel their own `pending_payment` session at any time; cancellation SHALL reopen the slot immediately when the slot is still in the future and SHALL move no money. The unpaid-booking expiry sweep SHALL run at least once per minute.

#### Scenario: Player returns to the coach page with an unpaid booking
- **WHEN** an amateur who left checkout opens the coach page within the payment window
- **THEN** a banner shows the booked time and remaining minutes with "Pay" and "Release slot" actions

#### Scenario: Player releases the slot
- **WHEN** the amateur releases their unpaid booking
- **THEN** the session becomes `cancelled`, the slot is open again in the listing, and no payment record changes

#### Scenario: Coach cannot cancel an unpaid booking
- **WHEN** the coach attempts to cancel a `pending_payment` session
- **THEN** the request is rejected with a conflict

#### Scenario: Released slot is bookable again
- **WHEN** a slot was reopened by an expired or released booking and another amateur books it
- **THEN** the booking succeeds and a new session is created for that slot
