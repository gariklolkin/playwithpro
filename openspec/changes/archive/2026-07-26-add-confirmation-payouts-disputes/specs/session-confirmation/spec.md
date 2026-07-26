# session-confirmation Specification (delta)

## ADDED Requirements

### Requirement: Player confirmation completes the session and releases escrow
From `awaiting_confirmation`, the session's player SHALL be able to confirm the session took place. Confirmation SHALL, within one atomic operation, move the session to `completed_paid` and trigger `PaymentProvider.release` for the held payment, with the snapshotted platform fee withheld from the coach payout. Only the session's two parties MAY act on a session (any other user's request yields not-found), and confirmation SHALL be rejected with a conflict when the session is not in `awaiting_confirmation`. A release failure SHALL NOT lose the confirmation: the session still completes, the payment stays `HELD`, and the failure is logged for retry by the sweep.

#### Scenario: Player confirms
- **WHEN** the player of an `awaiting_confirmation` session confirms it
- **THEN** the session becomes `completed_paid` and the held payment is released to the coach minus the platform fee

#### Scenario: Confirmation outside the window state
- **WHEN** the player attempts to confirm a session that is not `awaiting_confirmation`
- **THEN** the request is rejected with a conflict and no payout occurs

#### Scenario: Third party denied
- **WHEN** a user who is not a party of the session attempts to confirm it
- **THEN** the request yields not-found

### Requirement: Coach confirmation recorded as evidence
The session's coach SHALL be able to confirm an `awaiting_confirmation` session. Coach confirmation SHALL be recorded with a timestamp as evidence for dispute handling but SHALL NOT change the session status or trigger the payout — the payout is gated on the player's confirmation or the auto-confirm window. Each party's confirmation SHALL be recorded at most once.

#### Scenario: Coach confirms first
- **WHEN** the coach confirms an `awaiting_confirmation` session before the player acts
- **THEN** the coach's confirmation timestamp is recorded and the session remains `awaiting_confirmation` with funds still in escrow

#### Scenario: Repeated confirmation is idempotent
- **WHEN** a party confirms a session they already confirmed
- **THEN** no second confirmation record is created and the response reflects the existing state

### Requirement: Auto-confirm window
A session in `awaiting_confirmation` SHALL auto-complete once a configurable window after `endsAt` (default 48 hours) elapses without the player confirming or opening a dispute: the session moves to `completed_paid` and escrow is released to the coach exactly as for an explicit confirmation. Auto-confirm SHALL be enforced both by the periodic sweep (also run at startup) and inline on session read paths, following the established progression pattern. The pending auto-confirm deadline SHALL be exposed to both parties so the UI can show a countdown.

#### Scenario: Window elapses without action
- **WHEN** the sweep runs after the auto-confirm deadline of an `awaiting_confirmation` session with no dispute
- **THEN** the session becomes `completed_paid` and the payment is released to the coach

#### Scenario: Read path normalizes a stale session
- **WHEN** a party fetches a session whose auto-confirm deadline passed but the sweep has not yet run
- **THEN** the returned session is already `completed_paid`

#### Scenario: Dispute stops the clock
- **WHEN** the auto-confirm deadline passes for a session that is `disputed`
- **THEN** the session stays `disputed` and no payout occurs

### Requirement: Localized confirmation experience
The post-session confirmation surfaces — the confirmation banner with confirm and report-a-problem actions, the auto-confirm countdown, and payout status on past sessions — SHALL render from next-intl catalogs in all five locales with no hard-coded strings, showing times in the viewer's timezone.

#### Scenario: Localized confirmation banner
- **WHEN** a player opens their sessions list in any supported locale while a session awaits confirmation
- **THEN** the confirmation banner, countdown, and actions render from that locale's catalog
