## MODIFIED Requirements

### Requirement: Auto-confirm window
A session in `awaiting_confirmation` SHALL auto-complete once a configurable window after `endsAt` (default 48 hours) elapses without the player confirming or opening a dispute: the session moves to `completed_paid` and escrow is released to the coach exactly as for an explicit confirmation. Auto-confirm SHALL be enforced both by the periodic sweep (also run at startup) and inline on session read paths, following the established progression pattern. The pending auto-confirm deadline SHALL be exposed to both parties so the UI can show a countdown. At the session's end the player SHALL be emailed to confirm or report a problem, naming the deadline in their timezone, and the coach SHALL be emailed to confirm the session took place; these prompts SHALL be sent whether the transition came from the sweep or from a read path. When the payment is released — by confirmation or auto-confirm — the player SHALL receive a "payment released" email with a review request and the coach a payout email naming the amount minus the platform fee, sent once the payment row is `RELEASED`.

#### Scenario: Window elapses without action
- **WHEN** the sweep runs after the auto-confirm deadline of an `awaiting_confirmation` session with no dispute
- **THEN** the session becomes `completed_paid` and the payment is released to the coach

#### Scenario: Read path normalizes a stale session
- **WHEN** a party fetches a session whose auto-confirm deadline passed but the sweep has not yet run
- **THEN** the returned session is already `completed_paid`

#### Scenario: Dispute stops the clock
- **WHEN** the auto-confirm deadline passes for a session that is `disputed`
- **THEN** the session stays `disputed` and no payout occurs

#### Scenario: Session-ended prompt
- **WHEN** a paid session's end time passes
- **THEN** the player is emailed to confirm or report a problem with the deadline in their timezone and the coach is emailed to confirm

#### Scenario: Payout email once released
- **WHEN** the player confirms and the release succeeds
- **THEN** the player gets the released email with a review link and the coach gets the payout email, each exactly once
