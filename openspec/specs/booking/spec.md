# booking Specification

## Purpose
Booking a coaching session: atomic claiming of an open slot into a pending_payment session with snapshotted price/fee/times, video attachment rules for video analysis, payment-window expiry that releases the slot, and role-aware session lists for both parties.

## Requirements

### Requirement: Booking creation with atomic slot claim
The system SHALL let an authenticated amateur book a verified coach by selecting one of the coach's active services and one publicly listable open slot. Creating the booking SHALL atomically claim the slot (open → booked) and create a session in `pending_payment` with a payment deadline (configurable, default 15 minutes). When the slot is no longer claimable — already booked, removed, or starting in less than 2 hours — the booking SHALL be rejected with a conflict and no session created. The session SHALL snapshot the service type, price (minor units + currency), platform fee (configurable percentage, default 10%), and the slot's start/end times, so later price or availability edits never affect existing bookings.

#### Scenario: Successful booking
- **WHEN** an amateur books an open slot for a coach's consultation service
- **THEN** the slot becomes booked and a session is created in `pending_payment` with snapshotted price, fee, and times, and a payment deadline 15 minutes ahead

#### Scenario: Concurrent booking of the same slot
- **WHEN** two amateurs submit bookings for the same open slot at the same time
- **THEN** exactly one booking succeeds and the other receives a conflict with no session created

#### Scenario: Slot too soon
- **WHEN** an amateur attempts to book a slot starting in less than 2 hours
- **THEN** the booking is rejected with a conflict

#### Scenario: Price edit does not affect existing booking
- **WHEN** a coach changes a service price after a session was booked
- **THEN** the existing session keeps its snapshotted price

### Requirement: Video attachment for video-analysis bookings
A booking for the `video_analysis` service SHALL require attaching exactly one of the player's own videos in `ready` status. Bookings for other services SHALL NOT carry a video. Attaching a video that is not owned by the player or not `ready` SHALL be rejected.

#### Scenario: Video attached at booking
- **WHEN** an amateur books video analysis and selects a `ready` video from their library
- **THEN** the session is created with that video attached

#### Scenario: Video-analysis booking without a video
- **WHEN** an amateur submits a video-analysis booking with no video
- **THEN** the booking is rejected with a validation error

#### Scenario: Foreign or unready video rejected
- **WHEN** the submitted video id belongs to another user or is not `ready`
- **THEN** the booking is rejected and no session is created

### Requirement: Session lifecycle through escrow
Sessions SHALL follow the canonical lifecycle; `pending_payment → paid_escrow` occurs on successful payment and `pending_payment → cancelled` on expiry or payment failure abandonment. A session whose payment deadline has passed SHALL be treated as expired everywhere — payment attempts against it are rejected — and expiry SHALL release its slot back to open. Expiry SHALL be enforced both by a periodic sweep (also run at startup) and inline on payment and read paths. Paid sessions SHALL further progress by clock time — `paid_escrow → in_progress` at slot start and `in_progress → awaiting_confirmation` at slot end — as specified by the session-rooms capability; these paid statuses keep the slot booked. From `awaiting_confirmation` the session completes as specified by the session-confirmation capability (`completed_paid` on player confirmation or auto-confirm) or enters `disputed → resolved` as specified by the disputes capability. Additionally, either party SHALL be able to cancel a `paid_escrow` session before its slot starts: the session becomes `cancelled`, the held payment is refunded to the player in full, the slot is released back to open, and a calendar cancellation is sent per the calendar-invites capability. Cancelling a session at or after slot start SHALL be rejected with a conflict.

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
- **THEN** the session becomes `cancelled`, the payment is refunded to the player in full, the slot is open again, and a calendar cancellation is emailed to both parties

#### Scenario: Cancellation after start rejected
- **WHEN** a party attempts to cancel a session whose slot has started
- **THEN** the request is rejected with a conflict and the session keeps progressing

### Requirement: Session lists for both parties
The system SHALL provide each party role-appropriate session lists: a player sees their sessions and a coach sees sessions booked with them — split into upcoming and past by slot start time, showing the other party, service type, time in the viewer's timezone, and payment/escrow status including the `in_progress`, `awaiting_confirmation`, `completed_paid`, `disputed`, and `resolved` statuses. For paid online sessions (`video_analysis`, `consultation`) the list entry SHALL offer a join-room affordance gated by the session-room join window; for `game` sessions it SHALL surface the venue instead. Upcoming `paid_escrow` entries SHALL offer the pre-start cancel action; `awaiting_confirmation` entries SHALL surface the confirmation banner (confirm / report a problem, auto-confirm countdown); past entries SHALL show the payout outcome (paid out, refunded, or disputed). A player's review-eligible past entries (per the reviews capability) SHALL offer a leave-review action, and entries with a review SHALL display the given star rating to both parties. Sessions SHALL be visible only to their two parties (and admins). Cancelled unpaid sessions SHALL NOT clutter the default lists.

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

### Requirement: Localized booking flow
The booking flow — service selection, week slot picker, video attachment step, order summary with escrow notice, and payment-deadline countdown — SHALL render from the message catalogs in all five locales with no hard-coded strings, and SHALL display slot times in the viewer's timezone with an explicit "(your time)" label. The video attachment step SHALL appear only for video-analysis bookings and SHALL link to the upload flow when the player's library has no ready videos.

#### Scenario: Localized checkout
- **WHEN** a player opens the checkout page in any supported locale
- **THEN** the order summary, escrow notice, and countdown render from that locale's catalog

#### Scenario: Empty library during video-analysis booking
- **WHEN** a player with no ready videos starts a video-analysis booking
- **THEN** the attachment step offers a link to the video upload flow
