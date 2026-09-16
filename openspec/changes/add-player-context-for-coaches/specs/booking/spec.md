## ADDED Requirements

### Requirement: Session goal
A booking for any service MAY carry an optional goal ("what should we focus on?") of at most 500 characters, set by the player when booking and shown in the checkout summary. The player SHALL be able to edit or clear the goal until the session's slot starts, while the session is `pending_payment` or `paid_escrow`; later edits SHALL be rejected with a conflict. Only the player can edit the goal. The goal SHALL be returned to both parties in session data, and to the coach only under the paid-session rule of the player-profiles capability.

#### Scenario: Goal set at booking
- **WHEN** a player books with a 200-character goal
- **THEN** the session is created with that goal and the checkout summary shows it

#### Scenario: Goal too long
- **WHEN** a player submits a goal longer than 500 characters
- **THEN** the request is rejected with a validation error

#### Scenario: Edit before start
- **WHEN** the player changes the goal of a `paid_escrow` session before its slot starts
- **THEN** the new goal is saved and visible to the coach

#### Scenario: Edit after start rejected
- **WHEN** the player tries to change the goal after the slot started
- **THEN** the request is rejected with a conflict

#### Scenario: Coach cannot edit
- **WHEN** the coach tries to change the goal
- **THEN** the request is rejected with a forbidden error

## MODIFIED Requirements

### Requirement: Session lists for both parties
The system SHALL provide each party role-appropriate session lists: a player sees their sessions and a coach sees sessions booked with them — split into upcoming and past by slot start time, showing the other party, service type, time in the viewer's timezone, and payment/escrow status including the `in_progress`, `awaiting_confirmation`, `completed_paid`, `disputed`, and `resolved` statuses. For paid online sessions (`video_analysis`, `consultation`) the list entry SHALL offer a join-room affordance gated by the session-room join window; for `game` sessions it SHALL surface the venue instead. Upcoming `paid_escrow` entries SHALL offer the pre-start cancel action; `awaiting_confirmation` entries SHALL surface the confirmation banner (confirm / report a problem, auto-confirm countdown); past entries SHALL show the payout outcome (paid out, refunded, or disputed). A player's review-eligible past entries (per the reviews capability) SHALL offer a leave-review action, and entries with a review SHALL display the given star rating to both parties. A coach's entries for paid sessions SHALL offer a collapsed "About the player" disclosure containing the player's card and the session goal; a player's entries SHALL show the goal and allow editing it until the slot starts. Sessions SHALL be visible only to their two parties (and admins). Cancelled unpaid sessions SHALL NOT clutter the default lists.

#### Scenario: Player sees an upcoming paid session
- **WHEN** a player with a `paid_escrow` session opens their sessions list
- **THEN** the session appears under upcoming with the coach's name, service, local time, and a "paid, in escrow" status

#### Scenario: Coach sees who booked
- **WHEN** a coach opens their sessions list
- **THEN** they see their booked sessions with the player's name and, for video-analysis sessions, a link to the attached video

#### Scenario: Coach opens the player disclosure
- **WHEN** a coach expands "About the player" on a paid session entry
- **THEN** the player's card and the session goal are shown

#### Scenario: No disclosure on an unpaid entry
- **WHEN** a coach views a `pending_payment` entry
- **THEN** no "About the player" disclosure is offered

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
