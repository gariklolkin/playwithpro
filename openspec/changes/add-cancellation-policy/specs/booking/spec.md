## MODIFIED Requirements

### Requirement: Booking creation with atomic slot claim
The system SHALL let an authenticated amateur book a verified coach by selecting one of the coach's active services and one publicly listable open slot. Creating the booking SHALL atomically claim the slot (open → booked) and create a session in `pending_payment` with a payment deadline (configurable, default 15 minutes). When the slot is no longer claimable — already booked, removed, or starting in less than 2 hours — the booking SHALL be rejected with a conflict and no session created. The session SHALL snapshot the service type, price (minor units + currency), platform fee (configurable percentage, default 10%), the slot's start/end times, and the platform's cancellation policy in force (free-cancellation hours, late-refund percentage, no-refund hours, late-booking grace minutes), so later price, availability or policy edits never affect existing bookings.

#### Scenario: Successful booking
- **WHEN** an amateur books an open slot for a coach's consultation service
- **THEN** the slot becomes booked and a session is created in `pending_payment` with snapshotted price, fee, times and cancellation policy, and a payment deadline 15 minutes ahead

#### Scenario: Concurrent booking of the same slot
- **WHEN** two amateurs submit bookings for the same open slot at the same time
- **THEN** exactly one booking succeeds and the other receives a conflict with no session created

#### Scenario: Slot too soon
- **WHEN** an amateur attempts to book a slot starting in less than 2 hours
- **THEN** the booking is rejected with a conflict

#### Scenario: Price edit does not affect existing booking
- **WHEN** a coach changes a service price after a session was booked
- **THEN** the existing session keeps its snapshotted price

#### Scenario: Policy change does not affect existing booking
- **WHEN** the platform's cancellation policy configuration changes after a session was booked
- **THEN** the existing session keeps the terms it was booked under

### Requirement: Session lifecycle through escrow
Sessions SHALL follow the canonical lifecycle; `pending_payment → paid_escrow` occurs on successful payment and `pending_payment → cancelled` on expiry or payment failure abandonment. A session whose payment deadline has passed SHALL be treated as expired everywhere — payment attempts against it are rejected — and expiry SHALL release its slot back to open. Expiry SHALL be enforced both by a periodic sweep (also run at startup) and inline on payment and read paths. Releasing an unpaid booking or letting its payment window expire SHALL stay free and silent. Paid sessions SHALL further progress by clock time — `paid_escrow → in_progress` at slot start and `in_progress → awaiting_confirmation` at slot end — as specified by the session-rooms capability; these paid statuses keep the slot booked. From `awaiting_confirmation` the session completes as specified by the session-confirmation capability (`completed_paid` on player confirmation or auto-confirm) or enters `disputed → resolved` as specified by the disputes capability. Additionally, either party SHALL be able to cancel a `paid_escrow` session before its slot starts: the session becomes `cancelled`, the slot is released back to open, a calendar cancellation is sent per the calendar-invites capability, and the money follows the tiered cancellation policy. Cancelling a session at or after slot start SHALL be rejected with a conflict.

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

#### Scenario: Paid session cancelled well before start
- **WHEN** the player cancels a `paid_escrow` session 25 hours before the slot starts
- **THEN** the session becomes `cancelled`, the payment is refunded to the player in full, the slot is open again, and a calendar cancellation is emailed to both parties

#### Scenario: Unpaid release stays free
- **WHEN** a player releases a `pending_payment` booking
- **THEN** the session is cancelled with no cancellation record, no money movement and no email

#### Scenario: Cancellation after start rejected
- **WHEN** a party attempts to cancel a session whose slot has started
- **THEN** the request is rejected with a conflict and the session keeps progressing

### Requirement: Session lists for both parties
The system SHALL provide each party role-appropriate session lists: a player sees their sessions and a coach sees sessions booked with them — split into upcoming and past by slot start time, showing the other party, service type, time in the viewer's timezone, and payment/escrow status including the `in_progress`, `awaiting_confirmation`, `completed_paid`, `disputed`, and `resolved` statuses. For paid online sessions (`video_analysis`, `consultation`) the list entry SHALL offer a join-room affordance gated by the session-room join window; for `game` sessions it SHALL surface the venue instead. Upcoming `paid_escrow` entries SHALL offer the pre-start cancel action, whose confirmation SHALL state the exact refund to the player and payout to the coach for cancelling now as computed by the API, and SHALL warn a coach when the cancellation would be recorded as late; `awaiting_confirmation` entries SHALL surface the confirmation banner (confirm / report a problem, auto-confirm countdown); past entries SHALL show the payout outcome (paid out, refunded, or disputed), and cancelled paid entries SHALL show who cancelled and whether the payment was refunded, partly refunded (with the amount) or paid to the coach, with the coach offered the refund-in-full waiver while the payment has not settled. A player's review-eligible past entries (per the reviews capability) SHALL offer a leave-review action, and entries with a review SHALL display the given star rating to both parties. Sessions SHALL be visible only to their two parties (and admins). Cancelled unpaid sessions SHALL NOT clutter the default lists.

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

#### Scenario: Confirmation banner after the session
- **WHEN** a player opens their sessions list while a session is `awaiting_confirmation`
- **THEN** the entry surfaces confirm and report-a-problem actions with the auto-confirm countdown

#### Scenario: Payout status on past sessions
- **WHEN** a coach views a `completed_paid` session in their past list
- **THEN** the entry shows that the payout was released

#### Scenario: Leave-review action on an eligible entry
- **WHEN** a player views a `completed_paid` session without a review in their past list
- **THEN** the entry offers a leave-review action opening the review form

#### Scenario: Reviewed entry shows the rating
- **WHEN** either party views a past session that has a review
- **THEN** the entry displays the given star rating instead of the leave-review action

#### Scenario: Cancel dialog states the money
- **WHEN** a player opens the cancel confirmation of a session starting in 10 hours
- **THEN** the dialog states that half of the price is refunded and names both amounts before the player confirms

#### Scenario: Partly refunded entry
- **WHEN** either party views a session the player cancelled in the partial tier
- **THEN** the entry shows that the player cancelled and the partly refunded amount

### Requirement: Localized booking flow
The booking flow — service selection, week slot picker with a one-line cancellation policy summary beneath it, video attachment step, order summary with escrow notice, the cancellation policy block above the pay action, and payment-deadline countdown — SHALL render from the message catalogs in all five locales with no hard-coded strings, and SHALL display slot times in the viewer's timezone with an explicit "(your time)" label. The policy block SHALL state the session's snapshotted terms as concrete moments in the viewer's timezone (free cancellation until, partial refund percentage until, no refund after) and, when the booking falls inside the free-cancellation window, the late-booking grace instead; no tier number SHALL be hard-coded in the copy. The video attachment step SHALL appear only for video-analysis bookings and SHALL link to the upload flow when the player's library has no ready videos.

#### Scenario: Localized checkout
- **WHEN** a player opens the checkout page in any supported locale
- **THEN** the order summary, escrow notice, cancellation policy block, and countdown render from that locale's catalog

#### Scenario: Policy dates in the viewer's timezone
- **WHEN** a player in Europe/Berlin opens the checkout of a session starting Thursday 18:00 their time
- **THEN** the policy block says cancellation is free until Wednesday 18:00 and half is refunded until Thursday 16:00, in their timezone

#### Scenario: Late booking shows the grace
- **WHEN** a player opens the checkout of a session starting in 5 hours
- **THEN** the policy block says cancellation is free for 30 minutes after payment and half is refunded after that

#### Scenario: Empty library during video-analysis booking
- **WHEN** a player with no ready videos starts a video-analysis booking
- **THEN** the attachment step offers a link to the video upload flow

## ADDED Requirements

### Requirement: Tiered cancellation of paid sessions
A cancellation of a `paid_escrow` session SHALL be recorded on the session with the time, who cancelled (player, coach or admin), the tier and the amount refunded to the player, and the money SHALL follow the session's snapshotted policy, measured from the slot start:

- the **player** cancelling at least the free-cancellation hours (default 24) before start is refunded in full;
- the player cancelling later, but at least the no-refund hours (default 2) before start, is refunded the late-refund percentage (default 50 %) of the price, rounded to a minor unit; the coach receives the remainder minus a platform fee proportional to the retained part (`round(fee × retained / price)`);
- the player cancelling less than the no-refund hours before start is refunded nothing; the coach receives the price minus the platform fee;
- **late-booking grace:** a session paid when the free-cancellation window had already closed SHALL be free to cancel for the grace minutes (default 30) after payment, as long as the start is still at least the no-refund hours away;
- the **coach** cancelling at any time before start SHALL refund the player in full; a coach cancellation made less than the free-cancellation hours before start SHALL be recorded as late, with no money penalty.

Session reads for the two parties SHALL expose, for an upcoming paid session, the terms of cancelling now for the viewer (tier, refund to the player, payout to the coach, whether it would be recorded as late) together with the policy moments, and for a cancelled paid session the cancellation record.

#### Scenario: Partial tier
- **WHEN** the player cancels a 40.05 EUR session with a 4.01 EUR fee 10 hours before start
- **THEN** the cancellation is recorded with the partial tier and a 20.03 EUR refund, and the coach is owed 20.02 EUR minus a 2.00 EUR fee

#### Scenario: No-refund tier
- **WHEN** the player cancels one hour before start
- **THEN** the cancellation is recorded with no refund and the coach is owed the price minus the full platform fee

#### Scenario: Grace after a late booking
- **WHEN** a player pays for a session starting in 5 hours and cancels 20 minutes later
- **THEN** the refund is full

#### Scenario: Grace expired
- **WHEN** the same player cancels 40 minutes after paying
- **THEN** the partial tier applies

#### Scenario: Coach cancels late
- **WHEN** the coach cancels 3 hours before start
- **THEN** the player is refunded in full and the cancellation is recorded as a late coach cancellation

#### Scenario: Terms exposed before cancelling
- **WHEN** the player fetches a paid session starting in 10 hours
- **THEN** the response states the partial tier with the refund and payout amounts for cancelling now, and the moment the no-refund tier begins

### Requirement: Late-fee waiver
While the payment of a session cancelled in the partial or no-refund tier has not settled, the session's coach SHALL be able to waive the late fee, turning the cancellation into a full refund to the player; the waiver SHALL be recorded with its time and author, SHALL be possible at most once, and SHALL be rejected once the payment has settled. The player and third parties SHALL NOT be able to waive.

#### Scenario: Coach refunds in full
- **WHEN** the coach waives the fee of a partially refundable cancellation before the original start time
- **THEN** the player is refunded in full, nothing is released to the coach, and the waiver is recorded

#### Scenario: Too late to waive
- **WHEN** the coach attempts to waive after the payment was released at the original start time
- **THEN** the request is rejected with a conflict and no money moves

#### Scenario: Player cannot waive
- **WHEN** the player attempts to waive the fee of their own cancellation
- **THEN** the request is denied

### Requirement: Public cancellation policy
The system SHALL expose the platform's current cancellation policy (free-cancellation hours, late-refund percentage, no-refund hours, grace minutes) without authentication so that the booking surface can show the terms before a session exists.

#### Scenario: Policy shown under the slot picker
- **WHEN** a visitor opens a coach's booking panel
- **THEN** a one-line summary built from the current policy values is shown beneath the slot picker
