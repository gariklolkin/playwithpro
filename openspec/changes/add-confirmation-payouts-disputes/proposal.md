# Proposal: add-confirmation-payouts-disputes

## Why

Sessions now progress to `awaiting_confirmation` on the clock, but nothing can happen after that: escrowed money is held forever, `PaymentProvider.release/refund` are mock-implemented but unreachable, and the later lifecycle states (`completed_paid`, `disputed`, `resolved`) exist only as enum values. This change closes the money loop — the marketplace's core promise that coaches get paid and players are protected.

## What Changes

- **Session confirmation**: from `awaiting_confirmation`, either party can confirm the session happened; the player's confirmation completes the session (`completed_paid`) and releases escrow to the coach (minus the snapshotted platform fee). Coach confirmation is recorded as evidence but does not gate the payout.
- **Auto-confirm window**: if the player neither confirms nor disputes within a configurable window (default 48 h after `endsAt`), the session auto-completes and escrow is released — enforced by the established sweep + inline-normalization pattern.
- **Dispute flow**: within the confirmation window the player can open a dispute (reason required) instead of confirming; the session moves to `disputed`, freezing the payout and stopping auto-confirm. An admin resolves the dispute — release to coach or refund to player — moving the session to `resolved` with the resolution recorded.
- **Payout/refund wiring**: `PaymentProvider.release` and `refund` become reachable through the confirmation/dispute/cancellation paths; the held payment transitions `HELD → RELEASED | REFUNDED` in the audit trail. Still mock provider only — no real money moves in MVP.
- **Paid-session cancellation before start**: either party can cancel a `paid_escrow` session before the slot starts — full refund to the player, slot released back to open, and a calendar cancellation (`METHOD:CANCEL`) emailed via the existing (currently caller-less) `sendCancellationIfInvited`. *(Scope note: not named in the roadmap line, but it is the natural consumer of the refund path and of the already-specified cancellation-invite requirement; without it a paid booking is unconditionally locked in.)*
- **UI**: post-session confirmation banner on session lists/detail (confirm / report a problem, auto-confirm countdown per DESIGN.md), dispute form, payout/refund status on past sessions, cancel action on upcoming paid sessions, and a minimal admin dispute queue (list + resolve) alongside the existing verification queue. All five locales.

## Capabilities

### New Capabilities

- `session-confirmation`: confirmation actions by both parties, the auto-confirm window, completion (`completed_paid`), and escrow release with platform-fee withholding.
- `disputes`: opening a dispute during the confirmation window, payout freeze, admin resolution (release | refund) into `resolved`, and the dispute audit record.

### Modified Capabilities

- `booking`: lifecycle requirement extended — `awaiting_confirmation → completed_paid | disputed → resolved` now reachable, plus pre-start cancellation of a `paid_escrow` session (refund, slot reopened); session lists gain confirmation/dispute/payout affordances and the new statuses.
- `payments`: `release`/`refund` are now exposed through business flows (no longer "implemented but not exposed"); payment audit records transition `HELD → RELEASED | REFUNDED`.

## Impact

- **API**: new endpoints on sessions (confirm, dispute, cancel), admin dispute endpoints (list, resolve); `BookingsService`/new services touching the session state machine; sweep extended for auto-confirm; `PaymentsService` gains release/refund orchestration.
- **DB**: new `Dispute` model (session, opener, reason, status, resolution, admin note, timestamps); `Session` gains confirmation bookkeeping (per-party confirmed-at, auto-confirm deadline).
- **Web**: session lists/detail (confirmation banner, dispute form, cancel, payout status), admin dispute queue; 5 locale catalogs.
- **Providers**: `PaymentProvider` port unchanged (release/refund already declared); mock provider logs remain the "money moved" evidence. `CalendarProvider` unchanged — cancellation invite requirement already specified, gains its first caller.
- **Out of scope**: real payment provider, coach-initiated disputes, partial refunds, reviews (change 10), full admin console (change 11).
