# booking Specification (delta)

## MODIFIED Requirements

### Requirement: Session lifecycle through escrow
Sessions SHALL follow the canonical lifecycle; `pending_payment → paid_escrow` occurs on successful payment and `pending_payment → cancelled` on expiry or payment failure abandonment. A session whose payment deadline has passed SHALL be treated as expired everywhere — payment attempts against it are rejected — and expiry SHALL release its slot back to open. Expiry SHALL be enforced both by a periodic sweep (also run at startup) and inline on payment and read paths. Paid sessions SHALL further progress by clock time — `paid_escrow → in_progress` at slot start and `in_progress → awaiting_confirmation` at slot end — as specified by the session-rooms capability; these paid statuses keep the slot booked. Later lifecycle states (completed/disputed/resolved) are defined but not reachable in this change.

#### Scenario: Expired booking releases the slot
- **WHEN** a session in `pending_payment` passes its deadline and the sweep runs
- **THEN** the session becomes `cancelled` and its slot is open again

#### Scenario: Late payment attempt
- **WHEN** a player attempts to pay after the deadline
- **THEN** the payment is rejected with a conflict, no funds are held, and the session is cancelled with its slot released

#### Scenario: Paid session holds the slot
- **WHEN** a session reaches `paid_escrow`
- **THEN** its slot stays booked and is not affected by the expiry sweep

#### Scenario: Paid session progresses past escrow
- **WHEN** a `paid_escrow` session's slot start and later its end time pass
- **THEN** the session moves to `in_progress` and then `awaiting_confirmation`, keeping its slot booked throughout

### Requirement: Session lists for both parties
The system SHALL provide each party role-appropriate session lists: a player sees their sessions and a coach sees sessions booked with them — split into upcoming and past by slot start time, showing the other party, service type, time in the viewer's timezone, and payment/escrow status including the `in_progress` and `awaiting_confirmation` statuses. For paid online sessions (`video_analysis`, `consultation`) the list entry SHALL offer a join-room affordance gated by the session-room join window; for `game` sessions it SHALL surface the venue instead. Sessions SHALL be visible only to their two parties (and admins). Cancelled unpaid sessions SHALL NOT clutter the default lists.

#### Scenario: Player sees an upcoming paid session
- **WHEN** a player with a `paid_escrow` session opens their sessions list
- **THEN** the session appears under upcoming with the coach's name, service, local time, and a "paid, in escrow" status

#### Scenario: Coach sees who booked
- **WHEN** a coach opens their sessions list
- **THEN** they see their booked sessions with the player's name and, for video-analysis sessions, a link to the attached video

#### Scenario: Third party denied
- **WHEN** a user requests a session they are not a party of
- **THEN** the request yields not-found

#### Scenario: Join affordance near start time
- **WHEN** a player's paid consultation session is within the join window
- **THEN** its list entry offers a join-room control leading to the session room

#### Scenario: Game session shows venue in the list
- **WHEN** a party views a paid `game` session in their list
- **THEN** the entry shows the venue instead of a join-room control
