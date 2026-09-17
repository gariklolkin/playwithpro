## MODIFIED Requirements

### Requirement: Player confirmation completes the session and releases escrow
From `awaiting_confirmation`, the session's player SHALL be able to confirm the session took place. Confirmation SHALL, within one atomic operation, move the session to `completed_paid` and trigger `PaymentProvider.release` for the held payment, with the snapshotted platform fee withheld from the coach payout. The player's explicit confirmation SHALL win over any attendance classification: it releases the payment whatever outcome was stored. The player SHALL also be able to confirm a session that is `disputed` by an open *system-opened* dispute: that confirmation SHALL resolve the dispute with the release outcome (session `resolved`, payment released) through the same exactly-once resolution path as an admin resolution. Only the session's two parties MAY act on a session (any other user's request yields not-found), and confirmation SHALL be rejected with a conflict when the session is neither `awaiting_confirmation` nor `disputed` by an open system-opened dispute. A release failure SHALL NOT lose the confirmation: the session still completes, the payment stays `HELD`, and the failure is logged for retry by the sweep.

#### Scenario: Player confirms
- **WHEN** the player of an `awaiting_confirmation` session confirms it
- **THEN** the session becomes `completed_paid` and the held payment is released to the coach minus the platform fee

#### Scenario: Confirmation overrides a player no-show classification
- **WHEN** the player confirms an `awaiting_confirmation` session classified `PLAYER_NO_SHOW`
- **THEN** the session becomes `completed_paid` and the payment is released

#### Scenario: Player withdraws a system dispute by confirming
- **WHEN** the player confirms a session `disputed` by an open `COACH_NO_SHOW` system dispute
- **THEN** the dispute is resolved with the release outcome, the session becomes `resolved`, and the payment is released exactly once

#### Scenario: Player-reported dispute cannot be withdrawn by confirming
- **WHEN** the player attempts to confirm a session `disputed` by their own reported dispute
- **THEN** the request is rejected with a conflict and no payout occurs

#### Scenario: Confirmation outside the window state
- **WHEN** the player attempts to confirm a session that is not `awaiting_confirmation` and has no open system-opened dispute
- **THEN** the request is rejected with a conflict and no payout occurs

#### Scenario: Third party denied
- **WHEN** a user who is not a party of the session attempts to confirm it
- **THEN** the request yields not-found

### Requirement: Coach confirmation recorded as evidence
The session's coach SHALL be able to confirm an `awaiting_confirmation` session. For online services the coach's confirmation SHALL be recorded with a timestamp as evidence for dispute handling and SHALL NOT change the session status or trigger the payout. For in-person `game` sessions the coach's confirmation SHALL be an answer with exactly one of two values — the game took place, or the player did not come — recorded with the timestamp; the answer SHALL NOT itself move money but is the precondition for auto-confirm of a game. Each party's confirmation SHALL be recorded at most once, and a game answer SHALL NOT be changed after it is recorded.

#### Scenario: Coach confirms first
- **WHEN** the coach confirms an `awaiting_confirmation` online session before the player acts
- **THEN** the coach's confirmation timestamp is recorded and the session remains `awaiting_confirmation` with funds still in escrow

#### Scenario: Coach answers for a game
- **WHEN** the coach of an `awaiting_confirmation` game answers that the player did not come
- **THEN** the answer and its timestamp are recorded and the session remains `awaiting_confirmation`

#### Scenario: Game answer required
- **WHEN** the coach of a game submits a confirmation without an answer
- **THEN** the request is rejected with a validation error

#### Scenario: Repeated confirmation is idempotent
- **WHEN** a party confirms a session they already confirmed
- **THEN** no second confirmation record is created and the response reflects the existing state

### Requirement: Auto-confirm window
A session in `awaiting_confirmation` SHALL auto-complete once a configurable window after `endsAt` (default 48 hours) elapses without the player confirming and without a dispute: the session moves to `completed_paid` and escrow is released to the coach exactly as for an explicit confirmation. For online services auto-confirm SHALL apply only to sessions classified `HELD` or `PLAYER_NO_SHOW`; a session not yet classified when its deadline is evaluated SHALL be classified first. For in-person `game` sessions auto-confirm SHALL apply only when the coach has recorded an answer; a game without a coach answer SHALL stay `awaiting_confirmation` past the deadline until the coach answers (then it completes on the next evaluation) or the player acts, and once a configurable period after `endsAt` (default 7 days) has elapsed a `NO_ATTENDANCE` system dispute SHALL be opened for an admin with no automatic resolution. Auto-confirm SHALL be enforced both by the periodic sweep (also run at startup) and inline on session read paths, following the established progression pattern. The pending auto-confirm deadline SHALL be exposed to both parties so the UI can show a countdown, and SHALL be absent for a game whose coach has not answered.

#### Scenario: Window elapses without action
- **WHEN** the sweep runs after the auto-confirm deadline of an `awaiting_confirmation` session classified `HELD` with no dispute
- **THEN** the session becomes `completed_paid` and the payment is released to the coach

#### Scenario: Player no-show still pays the coach
- **WHEN** the auto-confirm deadline passes for a session classified `PLAYER_NO_SHOW` with no dispute
- **THEN** the session becomes `completed_paid` and the payment is released to the coach

#### Scenario: Read path normalizes a stale session
- **WHEN** a party fetches a session whose auto-confirm deadline passed but the sweep has not yet run
- **THEN** the returned session is already `completed_paid`

#### Scenario: Dispute stops the clock
- **WHEN** the auto-confirm deadline passes for a session that is `disputed`
- **THEN** the session stays `disputed` and no payout occurs

#### Scenario: Game with the coach's answer
- **WHEN** the auto-confirm deadline passes for a game whose coach answered that it took place
- **THEN** the session becomes `completed_paid` and the payment is released

#### Scenario: Game with a silent coach
- **WHEN** the auto-confirm deadline passes for a game whose coach has not answered
- **THEN** the session stays `awaiting_confirmation` and no payout occurs

#### Scenario: Silent coach after seven days
- **WHEN** seven days have passed since `endsAt` of a game still `awaiting_confirmation` without a coach answer
- **THEN** a `NO_ATTENDANCE` system dispute is opened and it is never resolved automatically

### Requirement: Localized confirmation experience
The post-session confirmation surfaces — the confirmation banner with the attendance evidence line shown before the confirm and report-a-problem actions, the auto-confirm countdown, the coach's two-option game answer, and payout status on past sessions — SHALL render from next-intl catalogs in all five locales with no hard-coded strings, showing times in the viewer's timezone.

#### Scenario: Localized confirmation banner
- **WHEN** a player opens their sessions list in any supported locale while a session awaits confirmation
- **THEN** the confirmation banner, countdown, and actions render from that locale's catalog

#### Scenario: Evidence line comes first
- **WHEN** a player views the confirmation banner of a session whose coach connected 18 minutes late
- **THEN** the banner states that the coach joined 18 minutes late before offering the confirm action

#### Scenario: Game answer options
- **WHEN** the coach of a game awaiting confirmation opens their sessions list
- **THEN** the two answers ("The game took place" / "The player didn't come") replace the single confirm action
