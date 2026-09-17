## 1. Data model, config, port

- [x] 1.1 Prisma: enums `CancelledBy`, `CancellationTier`; `Session` policy snapshot (`cancelFreeHours`, `cancelLateRefundPercent`, `cancelNoRefundHours`, `cancelGraceMin`), `paidAt`, `cancelledAt`, `cancelledBy`, `cancellationTier`, `cancellationRefundMinor`, `cancellationLate`, `cancellationReason`, `feeWaivedAt`, `feeWaivedById`; `Payment.refundedMinor`; three `NotificationKind` values; migration `add_cancellation_policy` with backfill (snapshot defaults, `paidAt`)
- [x] 1.2 Env: `CANCELLATION_FREE_HOURS` (24), `CANCELLATION_LATE_REFUND_PERCENT` (50), `CANCELLATION_NO_REFUND_HOURS` (2), `CANCELLATION_GRACE_MIN` (30), `COACH_LATE_CANCEL_THRESHOLD` (3); validation (`no-refund < free`, percent 0–100); both env examples
- [x] 1.3 `PaymentProvider.release(ref, { refundMinor? })` + mock; unit test
- [x] 1.4 Shared types: `CancelledBy`, `CancellationTier`, `CancellationPolicy`, `CancellationPolicyMoments`, `CancellationTerms`, `CancellationRecord`; `SessionResponse`, `AdminPaymentItem`, `AdminUserListItem`/`AdminUserDetail` extended; request types for force majeure

## 2. Policy and cancellation

- [x] 2.1 `bookings/cancellation-policy.ts` (snapshot from config, terms, moments) + unit tests at every boundary (24 h, 2 h, grace start/end, grace with < 2 h left, coach/admin, rounding, proportional fee)
- [x] 2.2 `create()` snapshots the policy; `pay()` stamps `paidAt`
- [x] 2.3 `cancel()`: terms computed and recorded in the conditional update; FREE settles now, PARTIAL/NONE stay held; cancelled-email payload with tier/refund; analytics properties; unit tests
- [x] 2.4 `waiveCancellationFee()` (coach or admin; transaction touching the payment row per design D4) + `POST /sessions/:id/cancellation/waive`; waiver notifications; unit tests
- [x] 2.5 `SettlementService`: tier-aware `terminalStatusFor`, clock gate, optimistic claim with `updatedAt`, `refundedMinor` written with the claim and reverted on failure, partial `release`; unit tests incl. waiver/release race
- [x] 2.6 Session mapper: `cancellationPolicy`, `cancellationTerms` (viewer-aware), `cancellation`; mapper tests
- [x] 2.7 Public `GET /cancellation-policy`
- [x] 2.8 Late coach cancellation count + threshold notification (dedupe key); unit test

## 3. Admin

- [x] 3.1 `AdminSessionsService` + controller: force-majeure cancel (required reason, never late), admin waiver; unit tests
- [x] 3.2 Ledger item: `refundedMinor`, cancellation record with reason, session status/start; analytics totals account for refunded parts
- [x] 3.3 User directory + detail: late cancellations (90 d) and flag for professionals (one grouped query per page)

## 4. Emails

- [x] 4.1 API catalogs ×5: cancelled templates branch on who cancelled (player/coach/admin) and the tier with amounts and the settlement moment; `cancellation.feeWaived.player/coach`; `admin.coachLateCancellations`; dispatcher params; completeness test green

## 5. Web

- [x] 5.1 Booking panel: one-line policy summary from `GET /cancellation-policy`; vitest
- [x] 5.2 Checkout: policy block with concrete local moments, grace variant; vitest
- [x] 5.3 Session actions: cancel dialog with API-computed amounts, coach late warning; cancelled entry outcome (refunded / partly refunded / paid to coach, who cancelled, pending settlement); coach "Refund in full"; vitest
- [x] 5.4 Admin ledger: partly refunded, cancellation record, force-majeure cancel (reason) and waiver actions; vitest
- [x] 5.5 Admin users: late-cancellation count and flag in directory and detail; vitest
- [x] 5.6 Catalog keys ×5; drift test green

## 6. Verification

- [x] 6.1 e2e: player cancel 25 h before → full refund now, slot open, record `player`/`FREE`
- [x] 6.2 e2e: player cancel 10 h before → `HELD` until start; at start one release with `refundedMinor` = 50 %, second sweep changes nothing; ledger row correct
- [x] 6.3 e2e: player cancel 1 h before → no refund, plain release at start
- [x] 6.4 e2e: paid 5 h ahead → free within 30 min of payment, partial after
- [x] 6.5 e2e: coach waives before start → full refund, never released; waive after settlement → 409; player waive → 403
- [x] 6.6 e2e: coach cancel 3 h before → full refund, late; third late cancel notifies admins once; directory shows count + flag
- [x] 6.7 e2e: admin force majeure → full refund, reason stored, not late; reason required; non-admin denied
- [x] 6.8 e2e: concurrent waiver + sweep at start → exactly one movement
- [x] 6.9 e2e: policy snapshot survives a config change; unpaid release and expiry stay free and silent
- [x] 6.10 Lint, tsc, api unit + e2e, web vitest green; browser smoke of checkout block, cancel dialog and partly-refunded entry in `en` + `de`
- [ ] 6.11 Roadmap entry 28; staging verification, then archive
