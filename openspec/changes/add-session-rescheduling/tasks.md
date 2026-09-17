## 1. Data model and config

- [x] 1.1 Prisma: `RescheduleStatus` enum, `SessionReschedule`, `SessionRescheduleOption`, `Session.rescheduleCount/rescheduledAt/cancelTierFloor`, six `NotificationKind` values; migration `add_session_rescheduling` incl. the partial unique index (one `OPEN` proposal per session)
- [x] 1.2 Env: `RESCHEDULE_MAX_PER_SESSION` (2), `RESCHEDULE_PROPOSAL_TTL_HOURS` (24), `RESCHEDULE_MAX_SHIFT_DAYS` (30); env examples
- [x] 1.3 Shared types: `RescheduleStatus`, `RescheduleProposal`, `RescheduleOption`, request types; `SessionResponse`, `SessionRoomResponse`, `AdminPaymentItem` extended

## 2. API

- [x] 2.1 `ReschedulesService.propose` (validation, atomic holds, expiry, notification) + unit tests
- [x] 2.2 `accept` (guarded session move, release of other options and the old slot, tier floor, sequence bump, notifications), `decline`, `withdraw` + unit tests incl. races
- [x] 2.3 Expiry/cleanup sweep (guarded cron): expired proposals, proposals on sessions that left `PAID_ESCROW`; `cancelPaid` and start-time progression supersede an open proposal
- [x] 2.4 `cancelPaid` guard on the `startsAt` it read (design D4)
- [x] 2.5 `cancellation-policy.ts`: tier floor + coach-proposal rule; mapper/terms inputs; unit tests
- [x] 2.6 Controller endpoints; session + room mappers (`reschedule`, `rescheduleAllowed`, `rescheduleCount`)
- [x] 2.7 Notifications: `dedupeSuffix`, five reschedule kinds, dispatcher routing to `sendUpdate` with the previous time, reminder re-arm after a move; API catalogs ×5; completeness test
- [x] 2.8 Availability dashboard data: slot held-for-reschedule marker
- [x] 2.9 Admin ledger: reschedule history

## 3. Web

- [x] 3.1 Propose dialog (valid options from the coach's open slots, 1–3, local time) from the list entry; coach cancel dialog suggests it; vitest
- [x] 3.2 Pending-proposal banner on the list entry (options, countdown, accept/decline/withdraw); vitest
- [x] 3.3 Same banner in the room pre-join; vitest
- [x] 3.4 Availability editor label for held slots; admin ledger history; catalogs ×5; drift test

## 4. Verification

- [x] 4.1 e2e: player proposes 2 options → both held; coach accepts one → session moved atomically, old slot + other option reopen, escrow unchanged, sequence bumped, accepted rows enqueued
- [x] 4.2 e2e: decline, withdraw and expiry release the holds and keep the original time
- [x] 4.3 e2e: accept vs cancel race → exactly one wins, no orphaned held slot
- [x] 4.4 e2e: third reschedule refused; proposal < 2 h before start refused; invalid options refused; second open proposal refused
- [x] 4.5 e2e: cancel after a reschedule accepted inside 24 h keeps the worse tier; coach-initiated declined proposal ⇒ free player cancel
- [x] 4.6 e2e: reminders re-armed for the new time; clips stay editable by the existing rule (`assertEditableBeforeStart` reads the session's current `startsAt`, which the move updates — covered by the booking suite's clip-replacement cases)
- [x] 4.7 Lint, tsc, api unit + e2e, web vitest green; browser smoke propose → accept in `en` + `ru`
- [ ] 4.8 Roadmap entry 29; staging verification, then archive
