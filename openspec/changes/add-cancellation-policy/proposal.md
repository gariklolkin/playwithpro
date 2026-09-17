## Why

Either party can cancel a paid session for a full refund until the second it starts, a slot freed inside the 2-hour booking notice can never be resold, nothing records who cancelled, and the rules first appear in the cancel confirmation — after payment. Coaches sell time that cannot be resold, EU consumers must see cancellation terms before paying, and the money model (a partial refund at settlement) is far cheaper to settle on the mock provider than after a real one is wired in. First half of GitHub issue [#6](https://github.com/gariklolkin/playwithpro/issues/6); rescheduling follows as `add-session-rescheduling`.

## What Changes

- **Platform-wide cancellation policy, snapshotted on the session at booking** like the price (`CANCELLATION_FREE_HOURS=24`, `CANCELLATION_LATE_REFUND_PERCENT=50`, `CANCELLATION_NO_REFUND_HOURS=2`, `CANCELLATION_GRACE_MIN=30`): a later config change never affects existing bookings, and no tier number is hard-coded in UI copy.
- **Player cancellation tiers** measured from the session start: ≥ 24 h → 100 % refund; < 24 h and ≥ 2 h → 50 % refund, the coach receives the rest minus a proportional platform fee; < 2 h → no refund, the coach receives the price minus the fee. **Late-booking grace:** a session paid inside the 24-hour window is free to cancel for 30 minutes after payment while the start is still ≥ 2 h away. Unpaid bookings stay free and silent.
- **Coach cancellation** always refunds the player in full; one made less than 24 h before start is recorded as *late* (no money penalty in MVP).
- **BREAKING (money model): one partial movement.** `PaymentProvider.release(ref, { refundMinor })` releases to the coach and returns the rest to the player in a single call; `Payment.refundedMinor` records the refunded part. A full refund settles immediately as today; a partial or no-refund cancellation keeps the payment `HELD` until the original start time, then settles exactly once.
- **Waiver before settlement.** Until the payment settles, the coach ("Refund in full") or an admin can waive the late fee, turning the cancellation into a full refund.
- **Admin force majeure.** A new admin action cancels any `paid_escrow` session with a full refund and a required reason; it never counts as a late cancellation.
- **Cancellation record** on the session: `cancelledAt`, `cancelledBy` (player / coach / admin), tier, `cancellationRefundMinor`, late flag, waiver, admin reason.
- **Coach reliability signal (admin only):** late-cancellation count per coach over a rolling 90 days in the user directory and detail, flagged at a threshold (`COACH_LATE_CANCEL_THRESHOLD=3`); admins are notified when a coach crosses it.
- **Terms shown before payment:** one-line summary under the slot picker (public `GET /cancellation-policy`), a policy block with concrete dates in the viewer's timezone above the Pay button, exact refund/payout amounts in the cancel dialog (computed by the API: `SessionResponse.cancellationTerms`), and the outcome on past cancelled entries ("Refunded", "Partly refunded (amount)", "Paid to coach", who cancelled).
- **Admin console:** cancellation details, force-majeure cancel and fee waiver on the ledger row of a session's payment; "Partly refunded" in the ledger.
- **Notifications (existing outbox):** the cancelled emails gain who cancelled, the tier and the refund amount; new kinds for "late fee waived" (player, coach) and "coach crossed the late-cancellation threshold" (admins). Catalogs ×5.

Out of scope: rescheduling (next change), anything after the session starts (no-shows — change 27), the refund-policy text page and terms acceptance (issue #7; the summary links there once it exists), per-coach policies, money penalties for coaches, a public cancellation rate, refunds after release, the real provider, the recording add-on refund (not built yet).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `booking`: policy snapshot at booking; tiered cancellation with grace, the cancellation record, coach late flag, waiver, policy display before payment and in the cancel dialog, outcome on past entries.
- `payments`: `release` with an optional refunded part; `refundedMinor` in the audit record; deferred exactly-once settlement of a late cancellation; waiver racing the settlement.
- `admin-console`: force-majeure cancel and fee waiver (the ledger stops being strictly read-only), partly-refunded display, coach late-cancellation count and flag.

## Impact

- **DB (migration `add_cancellation_policy`):** `Session.cancelFreeHours/cancelLateRefundPercent/cancelNoRefundHours/cancelGraceMin` (snapshot; backfilled with the defaults), `paidAt`, `cancelledAt`, `cancelledBy`, `cancellationTier`, `cancellationRefundMinor`, `cancellationLate`, `cancellationReason`, `feeWaivedAt`, `feeWaivedById`; `Payment.refundedMinor`; three `NotificationKind` values (fee waived ×2, late-cancellation threshold ×1).
- **API:** pure `cancellation-policy.ts`; `BookingsService.create/pay/cancel`, new `waiveCancellationFee`; `SettlementService` (deferred partial release, optimistic claim); `PaymentProvider` port + mock; `AdminSessionsService` (force majeure, waiver), admin users (late count), admin finance (refunded part in ledger and analytics); `GET /cancellation-policy`, `POST /sessions/:id/cancellation/waive`, `POST /admin/sessions/:id/cancel`, `POST /admin/sessions/:id/cancellation/waive`.
- **Shared types:** `CancellationPolicy`, `CancellationTerms`, `CancellationRecord`, enums `CancelledBy`, `CancellationTier`; `SessionResponse`, `AdminPaymentItem`, `AdminUserListItem/Detail` extended.
- **Web:** coach page booking panel, checkout, session actions (cancel dialog, waiver, past entry), admin ledger + users; catalogs ×5.
- **Risk:** deferred settlement adds a second way a `CANCELLED` session moves money — covered by the single `settle()` path, an optimistic claim against the waiver, and e2e for concurrent cancel / waiver / sweep.
