## MODIFIED Requirements

### Requirement: Session lifecycle through escrow
Sessions SHALL follow the canonical lifecycle; `pending_payment → paid_escrow` occurs on successful payment and `pending_payment → cancelled` on expiry or payment failure abandonment. A session whose payment deadline has passed SHALL be treated as expired everywhere — payment attempts against it are rejected — and expiry SHALL release its slot back to open. Expiry SHALL be enforced both by a periodic sweep (also run at startup) and inline on payment and read paths. Paid sessions SHALL further progress by clock time — `paid_escrow → in_progress` at slot start and `in_progress → awaiting_confirmation` at slot end — as specified by the session-rooms capability; these paid statuses keep the slot booked. From `awaiting_confirmation` the session completes as specified by the session-confirmation capability (`completed_paid` on player confirmation or auto-confirm) or enters `disputed → resolved` as specified by the disputes capability. Additionally, either party SHALL be able to cancel a `paid_escrow` session before its slot starts: the session becomes `cancelled`, the held payment is refunded to the player in full, the slot is released back to open, and both parties are notified per the session-notifications capability (who cancelled, the refund, a calendar cancellation per the calendar-invites capability; admins additionally when the coach cancelled). Cancelling a session at or after slot start SHALL be rejected with a conflict. Payment success SHALL enqueue the booking-paid notifications for both parties in the same transaction as the status change.

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

#### Scenario: Paid session cancelled before start
- **WHEN** a party cancels a `paid_escrow` session before the slot starts
- **THEN** the session becomes `cancelled`, the payment is refunded to the player in full, the slot is open again, and both parties are emailed who cancelled with a calendar cancellation

#### Scenario: Coach cancellation alerts admins
- **WHEN** the coach cancels a paid session
- **THEN** every admin receives a heads-up email, and a player cancellation sends none

#### Scenario: Cancellation after start rejected
- **WHEN** a party attempts to cancel a session whose slot has started
- **THEN** the request is rejected with a conflict and the session keeps progressing

## ADDED Requirements

### Requirement: Clip-change notification
When the player replaces the clip set of a paid video-analysis session, the coach SHALL be notified once after 15 minutes without further changes, so several edits in a row produce one email.

#### Scenario: Three edits, one email
- **WHEN** the player changes the clips three times within ten minutes
- **THEN** the coach receives one "clips updated" email

#### Scenario: Unpaid session changes send nothing
- **WHEN** the player changes the clips of a `pending_payment` session
- **THEN** no email is sent
