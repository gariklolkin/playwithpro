# Design: add-confirmation-payouts-disputes

## Context

`awaiting_confirmation` is reachable (clock-driven sweep + inline normalization in `session-progression.service.ts`), escrow holds work, and `PaymentProvider.release/refund` exist on the port and mock but have no callers. `BookingsService.sendCancellationIfInvited` is likewise caller-less. `SessionAttendance` rows exist as evidence. Admin role and an admin verification queue already exist (change 4). This change closes the lifecycle: confirmation, auto-confirm, payouts, refunds, disputes.

## Goals / Non-Goals

**Goals:**
- Player confirmation / 48 h auto-confirm → `completed_paid` + escrow release (fee withheld).
- Player-opened disputes with admin release/refund resolution → `resolved`.
- Pre-start cancellation of `paid_escrow` sessions → full refund, slot reopened, `.ics` CANCEL email.
- Exactly-once money movement per held payment, resilient to a failing provider call.

**Non-Goals:**
- Real payment provider, partial refunds, coach-initiated disputes, dispute messaging/attachments, reviews (change 10), full admin console (change 11).

## Decisions

1. **Status transitions and money movement are decoupled.** Confirmation/auto-confirm/resolution transition the *session* first (transactionally, with a conditional `updateMany` guard so only one actor wins); the *payment* transition `HELD → RELEASED|REFUNDED` happens after, by calling the provider and then conditionally updating the payment row (`updateMany where status=HELD`). If the provider call or payment update fails, the session state stands and the settlement sweep retries: any `completed_paid`/`resolved`/`cancelled`-with-hold session with a `HELD` payment is re-settled. Rationale: read paths and user actions never block on (or double-fire) money movement; exactly-once is enforced by the payment-status guard, not by callers. Alternative — do everything in one transaction around the provider call — rejected: wraps an external call in a DB transaction and breaks down with any real provider.

2. **Auto-confirm deadline is derived, not stored.** Sweep and inline normalization treat `status = AWAITING_CONFIRMATION AND endsAt < now() − AUTO_CONFIRM_WINDOW` as completable, mirroring how progression derives from `startsAt`/`endsAt`. New env `AUTO_CONFIRM_WINDOW_HOURS` (default 48). The API exposes the computed deadline so the UI can count down. Alternative — persisted `autoConfirmAt` column — rejected: a second source of truth that goes stale if the window config changes.

3. **Inline normalization only moves status; settlement stays in the sweep.** Read-path normalization (existing pattern) may flip `awaiting_confirmation → completed_paid` past the deadline, but never calls the provider — the sweep settles the payment moments later. Money movement from a GET would be surprising and hard to retry safely.

4. **Confirmation bookkeeping lives on Session** (`playerConfirmedAt`, `coachConfirmedAt DateTime?`). Player confirmation completes the session; coach confirmation is evidence only (spec'd). Idempotent: confirming twice is a no-op returning current state.

5. **New `Dispute` model, own module.** `Dispute { id, sessionId @unique, openedById, reason, status OPEN|RESOLVED, outcome RELEASE|REFUND?, resolvedById?, adminNote?, createdAt, resolvedAt? }`. One dispute per session (`@unique`). New `disputes` module owns player endpoint (`POST /sessions/:id/dispute`) and admin endpoints (`GET /admin/disputes`, `POST /admin/disputes/:id/resolve`), reusing the existing admin guard. Session endpoints for confirm/cancel stay in the bookings module (`POST /sessions/:id/confirm`, `POST /sessions/:id/cancel`) next to their state machine.

6. **Settlement orchestration in one service** (`settlement.service.ts` in the bookings module): release/refund invocation, payment-status guard, and the retry sweep — called by confirmation, auto-confirm, dispute resolution, and cancellation. Keeps provider calls in one place; `PaymentsModule` continues to own only the port + mock.

7. **Cancellation reuses existing pieces.** Pre-start cancel = conditional session update (`status=PAID_ESCROW AND startsAt > now()`), slot back to `OPEN`, settlement refund, and the first real call to `sendCancellationIfInvited`. Same conflict semantics as booking claims.

8. **Web:** confirmation banner + countdown (existing `use-now.ts` hook), report-a-problem dialog, cancel action with confirm dialog, payout status chips on past sessions; admin dispute queue page beside the verification queue showing attendance evidence. All strings in the five next-intl catalogs.

## Risks / Trade-offs

- [Session completed but payment stuck `HELD` after provider failure] → settlement sweep retries on every run (also at startup); payment-status guard makes retries idempotent.
- [Race: player confirms while auto-confirm sweep fires, or cancels at slot start] → all transitions use conditional `updateMany` on the current status; exactly one path wins, losers get conflict/no-op.
- [Mock provider hides real-provider failure modes (async webhooks, partial captures)] → decoupled settlement + audit statuses are the shape a real provider needs; explicitly out of scope otherwise.
- [Dispute window only as long as auto-confirm window — a player who misses it has no recourse] → accepted for MVP; admins can be reached out-of-band, and the payout audit trail preserves evidence.

## Migration Plan

1. Prisma migration: `Dispute` model + `Session.playerConfirmedAt`/`coachConfirmedAt` + new enums (`DisputeStatus`, `DisputeOutcome`). Purely additive.
2. New env `AUTO_CONFIRM_WINDOW_HOURS` (validated, default 48) — add to env validation and compose files.
3. No backfill: existing `awaiting_confirmation` sessions naturally enter the new flow; the sweep auto-confirms any that are already past the window.

## Open Questions

- None blocking. (Payout ledger/coach balance view deferred to the admin console change; e2e will assert mock-provider log + payment status instead.)
