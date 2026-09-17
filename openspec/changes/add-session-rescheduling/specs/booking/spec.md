## ADDED Requirements

### Requirement: Reschedule proposals
Either party of a `paid_escrow` session whose slot starts at least 2 hours from now SHALL be able to propose a new time by offering between one and three of the coach's open slots. Every offered slot SHALL belong to the session's coach, have the same duration as the booked slot, start at least 2 hours from now and within 30 days of the session's original start, and differ from the current slot and from each other. A session SHALL have at most one open proposal at a time and at most a configurable number of accepted reschedules (default 2). Creating the proposal SHALL atomically hold every offered slot (see the availability capability) — if any of them is no longer open the proposal SHALL be rejected with a conflict and nothing is held. The proposal SHALL expire at the earlier of a configurable time after creation (default 24 hours) and 2 hours before the session's current start. The other party SHALL be notified.

#### Scenario: Player proposes two options
- **WHEN** the player of a paid session starting in three days offers two of the coach's open one-hour slots next week
- **THEN** an open proposal is recorded with both options, both slots are held, the coach is notified, and the session's time is unchanged

#### Scenario: Offered slot already taken
- **WHEN** one of the offered slots was booked by someone else a moment earlier
- **THEN** the proposal is rejected with a conflict and none of the offered slots is held

#### Scenario: Second proposal refused
- **WHEN** a party proposes a new time while the session already has an open proposal
- **THEN** the request is rejected with a conflict

#### Scenario: Too close to the start
- **WHEN** a party proposes a new time for a session starting in 90 minutes
- **THEN** the request is rejected with a conflict

#### Scenario: Third reschedule refused
- **WHEN** a party proposes a new time for a session that was already rescheduled twice
- **THEN** the request is rejected with a conflict

#### Scenario: Invalid option
- **WHEN** a party offers a slot of another coach, of a different duration, starting in less than 2 hours, or more than 30 days from the original start
- **THEN** the request is rejected with a validation error and nothing is held

### Requirement: Responding to a reschedule proposal
The party who did not make the proposal SHALL be able to accept exactly one of its options or decline it; the proposer SHALL be able to withdraw it; nobody else MAY act on it. Acceptance SHALL, in one atomic operation: mark the proposal accepted; move the session's slot, start and end to the chosen option; release the other offered slots; and reopen the previous slot when it still starts at least 2 hours from now. Acceptance SHALL NOT touch the escrowed payment, the snapshotted price, fee and cancellation policy, the room, the attached clips, the goal or (for games) the venue, and attached clips SHALL stay editable until the new start. Declining, withdrawing, expiry, a cancellation of the session and the session starting SHALL close the proposal and release every offered slot, leaving the booking as it was. Concurrent actions SHALL resolve to exactly one outcome with no slot left held by a closed proposal. Both parties SHALL be notified of the outcome.

#### Scenario: Coach accepts one option
- **WHEN** the coach accepts the second of two offered options
- **THEN** the session moves to that slot's time, the first option and the old slot are open again, the payment is still held for the same amount, and the proposal is recorded as accepted

#### Scenario: Old slot too close to reopen
- **WHEN** a proposal is accepted while the previous slot starts in 90 minutes
- **THEN** the previous slot is not reopened

#### Scenario: Decline keeps the original time
- **WHEN** the other party declines the proposal
- **THEN** the session keeps its time, every offered slot is open again, and the proposer is notified

#### Scenario: Proposal expires
- **WHEN** nobody responds within 24 hours
- **THEN** the proposal is recorded as expired, every offered slot is open again, and both parties are notified

#### Scenario: Accept races a cancellation
- **WHEN** one party accepts a proposal at the same moment the other cancels the session
- **THEN** exactly one of the two succeeds, the other receives a conflict, and no offered slot stays held

#### Scenario: Proposer cannot accept their own proposal
- **WHEN** the proposer attempts to accept their proposal
- **THEN** the request is denied

#### Scenario: Clips after a reschedule
- **WHEN** a video-analysis session was moved to a later time
- **THEN** the player can still replace the attached clips until the new start

### Requirement: Cancellation after a reschedule
A reschedule accepted when the player could no longer cancel for free SHALL NOT improve the player's cancellation terms: the tier the player would have got by cancelling at the moment of acceptance SHALL be recorded on the session, and a later player cancellation SHALL never get a better tier than the recorded one. Independently, while a proposal made by the coach is open, or after the latest coach-made proposal was declined or expired without a later accepted reschedule, a cancellation by the player SHALL be refunded in full.

#### Scenario: No loophole
- **WHEN** a session starting in 10 hours is moved to next week and the player cancels two days later
- **THEN** the partial tier applies although the new start is more than 24 hours away

#### Scenario: Coach asked to move
- **WHEN** the coach proposed a new time 5 hours before the start, the player declined, and the player then cancels
- **THEN** the player is refunded in full

### Requirement: Reschedule surfaces
Upcoming paid list entries SHALL offer "Propose a new time" next to the cancel action when a proposal is allowed, and the coach's cancel confirmation SHALL suggest proposing a new time instead. The proposal dialog SHALL list only valid options from the coach's open slots in the viewer's timezone. While a proposal is open both parties SHALL see it on the list entry and in the session room's pre-join view with every option in local time, the expiry countdown, and the actions available to them (accept an option or decline for the responder, withdraw for the proposer). All strings SHALL render from the message catalogs in all five locales.

#### Scenario: Responder sees the options
- **WHEN** the coach opens their sessions list while the player's proposal is open
- **THEN** the entry shows both options in the coach's timezone, when the proposal expires, and accept and decline actions

#### Scenario: Proposer can withdraw
- **WHEN** the player opens the session room pre-join while their proposal is open
- **THEN** the banner shows the offered times and a withdraw action, and no accept action
