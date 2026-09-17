## 1. Data model and config

- [x] 1.1 Prisma: enums `AttendanceOutcome`, `CoachGameAnswer`, `DisputeKind`, `DisputeReasonCategory`, `DisputeResolvedVia`; `Session.attendanceOutcome/attendancePartial/classifiedAt/coachGameAnswer`; `Dispute.kind` (default `PLAYER_REPORTED`), `reasonCategory?`, nullable `openedById` + `reason`, `coachResponse?`, `coachRespondedAt?`, `responseDueAt?`, `resolvedVia?`, `systemNoteCode?`; index `(status, responseDueAt)`; migration `add_no_show_protection` with the backfill from design §Migration
- [x] 1.2 `env.validation.ts` + `.env.example` + `infra/k8s/env.example`: `NO_SHOW_RESPONSE_WINDOW_HOURS` (48), `NO_SHOW_AUTO_RESOLVE` (true), `NO_SHOW_CLASSIFY_BUFFER_MIN` (5), `GAME_UNANSWERED_DISPUTE_DAYS` (7)
- [x] 1.3 Null-safe opener everywhere a dispute is read (admin list mapper, party mapper, email context)
- [x] 1.4 Shared types: `AttendanceOutcome`, `AttendanceSummary`, `CoachGameAnswer`, `DisputeKind`, `DisputeReasonCategory`, `DisputeResolvedVia`; extend `SessionResponse`, `DisputeSummary`, `AdminDisputeItem`, `OpenDisputeRequest`, `ConfirmSessionRequest`, `DisputeResponseRequest`

## 2. Classification

- [x] 2.1 `session-rooms/attendance-classifier.ts` — pure `classifyAttendance()` (connected-in-window, interval merge, overlap, partial flag, five outcomes) per design D1
- [x] 2.2 Unit tests: every outcome, partial (late coach, short overlap), rejoins, connections outside the window, open interval without `leftAt`, webhook-outage shape → `EVIDENCE_GAP`
- [x] 2.3 `NoShowService.classifyDue()` (own minute sweep in the disputes module — the progression service cannot depend on disputes; auto-confirm is gated on the stored outcome, so sweep order does not matter): guarded first query, conditional update + dispute creation in one transaction (D3), `session_classified` analytics event
- [x] 2.4 `progressedStatus()`: online auto-confirm only for `HELD`/`PLAYER_NO_SHOW`; game auto-confirm only with `coachConfirmedAt`; `autoConfirmAt` null for a silent-coach game; unit tests
- [x] 2.5 Game 7-day step: `NO_ATTENDANCE` system dispute without `responseDueAt`; unit test

## 3. Disputes

- [x] 3.1 `NoShowService.openDispute(tx, session, kind)` — sets `responseDueAt` only for `COACH_NO_SHOW`/`NO_ATTENDANCE` from classification and only when auto-resolve is on; enqueues the existing dispute-opened notifications with `disputeKind` in the payload
- [x] 3.2 `open()`: `category` required, `reason` required only for `OTHER`; stores `kind = PLAYER_REPORTED`; DTO + unit tests
- [x] 3.3 `DisputeResolutionService.resolve()` (bookings module, shared by admin verdicts, the deadline sweep and `BookingsService.confirm`) takes an actor (admin | system | player), records `resolvedVia` / `systemNoteCode`; existing conditional update and settlement unchanged; race unit test (admin vs system)
- [x] 3.4 `respond()` + `POST /sessions/:id/dispute/response` (coach only, once, open system dispute only, clears `responseDueAt`); `dispute_coach_responded` event; unit tests
- [x] 3.5 `NoShowService.autoResolveDue()` on the no-show sweep tick (guarded, no-op when the switch is off); `dispute_auto_resolved` event; unit tests incl. kill switch and responded dispute
- [x] 3.6 `BookingsService.confirm`: player confirm on an open system dispute → `resolve(RELEASE, player)`; conflict for a player-reported dispute; coach game answer (`gameAnswer` required for a game coach, rejected otherwise, immutable)
- [x] 3.7 Admin: `GET /admin/disputes?kind=`, item with attendance summary, coach response, `responseDueAt`, `resolvedVia`, `coachPreviousNoShows` (one grouped query per page)
- [x] 3.8 Session mappers: `attendance` summary for online sessions (parties only, no raw rows), extended `DisputeSummary`, `coachGameAnswer`
- [x] 3.9 API email catalogs ×5 (change 26 layer): dispute-opened copy branches on `disputeKind` (coach: evidence + respond-by date; player: on hold + refund date); completeness test still green

## 4. Web

- [x] 4.1 Player confirmation banner: evidence line first (never joined / joined N min late / short overlap), then actions; vitest
- [x] 4.2 Dispute form: reason category select, text optional except "other"; validation messages; vitest
- [x] 4.3 System-dispute state on the player card (on hold, refund countdown or "an admin will decide", confirm action) and on the coach card (evidence, deadline, respond form, submitted statement); vitest
- [x] 4.4 Game: coach two-option answer replaces the single confirm; countdown hidden while the coach is silent; vitest
- [x] 4.5 Room waiting note (role-specific copy, after `startsAt` + 10 min, disappears when the counterpart connects, no action); vitest with fake timers
- [x] 4.6 Admin disputes: kind badge + filter, summary above raw rows, coach response, auto-resolve deadline, previous no-show count, resolved-via label; vitest
- [x] 4.7 Catalog keys ×5 (`sessions.confirmation.*`, `sessions.dispute.*`, `room.waiting.*`, `admin.disputes.*`); catalog-drift test green

## 5. Verification

- [x] 5.1 e2e (settlement suite; attendance rows written directly — the webhook→row path is covered by the session-rooms suite — and the sweep driven with a moved clock): player connected / coach absent → `disputed` `COACH_NO_SHOW`; no response → `resolved` + `REFUNDED` exactly once after the window
- [x] 5.2 e2e: coach responds → dispute stays open, no money moves until an admin resolves
- [x] 5.3 e2e: coach connected / player absent → no dispute, `completed_paid` + release at auto-confirm; both connected → existing UC-CNF cases unchanged
- [x] 5.4 e2e: no rows → `NO_ATTENDANCE` auto-refund; coach join row without `connectedAt` → `EVIDENCE_GAP` still open after the window
- [x] 5.5 e2e: player confirms on a system dispute → `resolved` + release; player confirms after `PLAYER_NO_SHOW` → release
- [x] 5.6 `NO_SHOW_AUTO_RESOLVE=false` → disputes open without a deadline, never auto-resolve (unit test in `no-show.service.spec.ts`; the flag is read at app boot, so not an e2e case)
- [x] 5.7 e2e: game — coach answered → release at 48 h; silent coach → no release at 48 h, admin dispute after 7 days
- [x] 5.8 e2e: classification runs once; duplicate/late webhook after classification changes nothing
- [x] 5.9 Lint, tsc, api unit + e2e, web vitest green; browser smoke of the player banner, coach respond form and admin queue in `en` + `ru`
- [ ] 5.10 Roadmap entry 27 in `openspec/project.md`; staging: deploy with auto-resolve off, two-account manual check from the issue, enable, then archive
