## Context

`BookingsService.cancel` flips `PAID_ESCROW → CANCELLED` with a conditional update (guarding the race with the start-time sweep), reopens the slot, enqueues the cancelled emails (payload `cancelledBy`) and calls `SettlementService.settle()`, whose `terminalStatusFor` maps every `CANCELLED` session to a full `REFUNDED`. `settle()` is the only place money moves: session status decides the direction, the conditional `HELD → terminal` update is the claim, a provider failure reverts the claim and the minute sweep retries. The `PaymentProvider` port has amount-less `release(ref)` / `refund(ref)`.

## Goals / Non-Goals

**Goals:** tiered player cancellation with a snapshotted policy and a grace period; one partial money movement; deferred, waivable settlement that stays exactly-once; a cancellation record; admin force majeure and waiver; coach late-cancellation signal; terms visible before payment.

**Non-Goals:** rescheduling (next change), post-start flows, legal text pages, per-coach policies, coach penalties, real provider.

## Decisions

### D1. The policy is a pure module over a snapshot
`bookings/cancellation-policy.ts`:
- `policyFromConfig(config) → CancellationPolicySnapshot { freeHours, lateRefundPercent, noRefundHours, graceMin }` — written onto the session in `create()`.
- `cancellationTerms({ policy, priceMinor, feeMinor, startsAt, paidAt, by, now }) → { tier: FREE|PARTIAL|NONE, refundMinor, coachGrossMinor, coachFeeMinor, coachNetMinor, late }`.
  - `by = coach | admin` → always `FREE`; `late = by === coach && startsAt − now < freeHours`.
  - `by = player`: `msLeft ≥ freeHours` → FREE; else if grace applies (`paidAt > startsAt − freeHours` **and** `now ≤ paidAt + graceMin` **and** `msLeft ≥ noRefundHours`) → FREE; else `msLeft ≥ noRefundHours` → PARTIAL (`refund = round(price × percent / 100)`); else NONE.
  - `coachFeeMinor = round(fee × retained / price)`.
- `policyMoments(policy, startsAt, paidAt|now)` → `freeUntil`, `partialUntil`, `graceUntil | null` for the UI.
The same function feeds the cancel transaction, `SessionResponse.cancellationTerms` (what happens if *the viewer* cancels now) and the checkout block — one definition, unit-tested at every boundary. `Session.paidAt` is new (set in `pay()`); historical paid rows are backfilled from their held payment's `createdAt`.

### D2. Cancellation is recorded in the same conditional update
The existing `updateMany({ status: PAID_ESCROW, startsAt > now })` also writes `cancelledAt`, `cancelledBy`, `cancellationTier`, `cancellationRefundMinor`, `cancellationLate`. The terms are computed immediately before the update from the row read in `requireParty`; the inputs that matter (`startsAt`, snapshot, `paidAt`) are immutable while `PAID_ESCROW` in this change, so there is no read-modify-write hazard. (The reschedule change will move `startsAt`; it adds its own guard.) The slot is reopened in every tier, as today — inside 2 h it simply cannot be resold.

### D3. Settlement: status still decides, the record refines, the clock gates
`terminalStatusFor(CANCELLED)`:
- tier `FREE`, no record (legacy rows), or `feeWaivedAt` set → `REFUNDED` now;
- tier `PARTIAL`/`NONE` and `now < startsAt` → `null` (nothing owed yet);
- tier `PARTIAL`/`NONE` and `now ≥ startsAt` → `RELEASED` with `refundMinor = cancellationRefundMinor`.
The sweep's query already selects `HELD` payments of `CANCELLED` sessions; it now simply gets `null` for the waiting ones. The claim update also writes `refundedMinor`, and the provider call becomes `release(ref, refundMinor ? { refundMinor } : undefined)`. On provider failure the claim (status **and** `refundedMinor`) is reverted.

*Alternative considered:* settle at cancel time — rejected in the issue: a mistake would need a refund after release, which no port supports.

### D4. Waiver vs. release: optimistic claim on the payment row
A waiver and the start-time release must never both win. Both are made to collide on the `Payment` row:
- `settle()` reads the held payment and claims it with `where: { id, status: HELD, updatedAt: <as read> }`;
- the waiver runs in one transaction: `session.updateMany({ id, status: CANCELLED, tier ∈ {PARTIAL, NONE}, feeWaivedAt: null } → feeWaivedAt, feeWaivedById, cancellationRefundMinor = price)` **and** `payment.updateMany({ sessionId, status: HELD } → touch)` (Prisma bumps `updatedAt`); either count = 0 → `ConflictException`, rollback.
So: release claimed first → the waiver finds no `HELD` row → 409, no state change. Waiver committed first → a `settle()` that read the row earlier fails its claim (stale `updatedAt`) and returns; the waiver's own `settle()` call (or the next sweep) re-reads the session, sees `feeWaivedAt`, refunds. No row locks, no new columns. `Payment.updatedAt` is `@updatedAt` with ms precision — two writes in the same millisecond are not a realistic hazard for one payment row, and the claim's `status: HELD` condition still prevents a double movement; the `updatedAt` condition only closes the *direction* race.

### D5. Admin actions live in a small `AdminSessionsService`
`POST /admin/sessions/:id/cancel { reason }` reuses a shared private cancel routine (`BookingsService.cancelPaid(session, { by, actorId, reason })`) so the slot/calendar/email/settle sequence exists once; `by = admin` forces `FREE`, `late = false`. `POST /admin/sessions/:id/cancellation/waive` and the coach's `POST /sessions/:id/cancellation/waive` call the same `BookingsService.waiveCancellationFee(sessionId, actor)`.
The ledger stays the admin's entry point to a session (there is no admin session browser): its rows gain the cancellation record and the two actions. The spec sentence "no money movement from the admin console" is narrowed accordingly.

### D6. Late-cancellation count is a query, not a counter
`count(Session where proProfileId, cancelledBy = COACH, cancellationLate, cancelledAt ≥ now − 90 d)`. Directory: one `groupBy proProfileId` for the page's professionals. Threshold notification: after a late coach cancel commits, count; if `count === threshold` enqueue `COACH_LATE_CANCELLATIONS_ADMIN` per admin with dedupe key `coach:<profileId>:late:<count>:<cancelledAt day>` — "exactly when crossing", never on every later cancel.

### D7. API shape
- `SessionResponse.cancellationPolicy: { freeUntil, partialUntil, graceUntil, lateRefundPercent } | null` — for `pending_payment` and `paid_escrow` (for unpaid, grace is computed as if paid now).
- `SessionResponse.cancellationTerms: { tier, refundMinor, coachNetMinor, late } | null` — `paid_escrow` before start, for the viewer's role.
- `SessionResponse.cancellation: { by, at, tier, refundMinor, late, waived, settled } | null` — cancelled paid sessions; `reason` only for admins (ledger).
- `GET /cancellation-policy` (public, cached 5 min) → current config values.
- `AdminPaymentItem` += `refundedMinor`, `cancellation` (with reason), `sessionStatus`, `sessionStartsAt`; analytics "released" totals subtract `refundedMinor`, "refunded" totals add it.

### D8. Notifications
`SESSION_CANCELLED_*` payload gains `tier`, `refundMinor`; the five catalogs' cancelled templates branch on `cancelledBy` (incl. `admin`) and the tier. New kinds: `CANCELLATION_FEE_WAIVED_PLAYER`, `CANCELLATION_FEE_WAIVED_COACH`, `COACH_LATE_CANCELLATIONS_ADMIN` (all transactional). The dispatcher's `stillApplies` keeps cancelled emails valid for `CANCELLED` sessions as today.

## Risks / Trade-offs

- [Player cancels late, coach's slot reopens but the player's money is held for hours] → by design (waiver window); the cancel dialog and the email say when and how much is refunded.
- [Clock skew between the cancel request and the tier boundary] → the API's clock is the only one used; the dialog's amounts come from the API and the cancel response carries the recorded tier — if the boundary passed between dialog and click, the UI shows the recorded (worse) tier. Acceptable; the boundary moments are displayed.
- [Legacy cancelled rows have no record] → treated as `FREE` (they were all full refunds).
- [Ledger gains write actions] → admin-only guard + required reason + the same conditional updates as the parties' actions.

## Migration Plan

Additive migration; backfill policy snapshot columns with the defaults and `paidAt` from held/settled payments. No behaviour change for sessions already cancelled. Rollback: the old code ignores the new columns; sessions cancelled in a late tier while the new code ran would be fully refunded by the old `terminalStatusFor` — safe for players, acceptable pre-launch.

## Open Questions

- Coach money penalty for late cancellations — deferred until real payouts (issue's alternative).
