## 1. Data model and config

- [ ] 1.1 Prisma: enums `AttendanceOutcome`, `CoachGameAnswer`, `DisputeKind`, `DisputeReasonCategory`, `DisputeResolvedVia`; `Session.attendanceOutcome/attendancePartial/classifiedAt/coachGameAnswer`; `Dispute.kind` (default `PLAYER_REPORTED`), `reasonCategory?`, nullable `openedById` + `reason`, `coachResponse?`, `coachRespondedAt?`, `responseDueAt?`, `resolvedVia?`, `systemNoteCode?`; index `(status, responseDueAt)`; migration `add_no_show_protection` with the backfill from design §Migration
- [ ] 1.2 `env.validation.ts` + `.env.example` + `infra/k8s/env.example`: `NO_SHOW_RESPONSE_WINDOW_HOURS` (48), `NO_SHOW_AUTO_RESOLVE` (true), `NO_SHOW_CLASSIFY_BUFFER_MIN` (5), `GAME_UNANSWERED_DISPUTE_DAYS` (7)
- [ ] 1.3 Null-safe opener everywhere a dispute is read (admin list mapper, party mapper, email context)
- [ ] 1.4 Shared types: `AttendanceOutcome`, `AttendanceSummary`, `CoachGameAnswer`, `DisputeKind`, `DisputeReasonCategory`, `DisputeResolvedVia`; extend `SessionResponse`, `DisputeSummary`, `AdminDisputeItem`, `OpenDisputeRequest`, `ConfirmSessionRequest`, `DisputeResponseRequest`

## 2. Classification

- [ ] 2.1 `session-rooms/attendance-classifier.ts` — pure `classifyAttendance()` (connected-in-window, interval merge, overlap, partial flag, five outcomes) per design D1
- [ ] 2.2 Unit tests: every outcome, partial (late coach, short overlap), rejoins, connections outside the window, open interval without `leftAt`, webhook-outage shape → `EVIDENCE_GAP`
- [ ] 2.3 `SessionProgressionService.classifyDue()` in the sweep before auto-confirm: guarded first query, conditional update + dispute creation in one transaction (D3), `session_classified` analytics event
- [ ] 2.4 `progressedStatus()`: online auto-confirm only for `HELD`/`PLAYER_NO_SHOW`; game auto-confirm only with `coachConfirmedAt`; `autoConfirmAt` null for a silent-coach game; unit tests
- [ ] 2.5 Game 7-day step: `NO_ATTENDANCE` system dispute without `responseDueAt`; unit test

## 3. Disputes

- [ ] 3.1 `DisputesService.openBySystem(tx, session, kind)` — sets `responseDueAt` only for `COACH_NO_SHOW`/`NO_ATTENDANCE` from classification and only when auto-resolve is on; enqueues the existing dispute-opened notifications with `disputeKind` in the payload
- [ ] 3.2 `open()`: `category` required, `reason` required only for `OTHER`; stores `kind = PLAYER_REPORTED`; DTO + unit tests
- [ ] 3.3 `resolve()` takes an actor (admin | system | player), records `resolvedVia` / `systemNoteCode`; existing conditional update and settlement unchanged; race unit test (admin vs system)
- [ ] 3.4 `respond()` + `POST /sessions/:id/dispute/response` (coach only, once, open system dispute only, clears `responseDueAt`); `dispute_coach_responded` event; unit tests
- [ ] 3.5 `autoResolveDue()` on the settlement sweep tick (guarded, no-op when the switch is off); `dispute_auto_resolved` event; unit tests incl. kill switch and responded dispute
- [ ] 3.6 `BookingsService.confirm`: player confirm on an open system dispute → `resolve(RELEASE, player)`; conflict for a player-reported dispute; coach game answer (`gameAnswer` required for a game coach, rejected otherwise, immutable)
- [ ] 3.7 Admin: `GET /admin/disputes?kind=`, item with attendance summary, coach response, `responseDueAt`, `resolvedVia`, `coachPreviousNoShows` (one grouped query per page)
- [ ] 3.8 Session mappers: `attendance` summary for online sessions (parties only, no raw rows), extended `DisputeSummary`, `coachGameAnswer`
- [ ] 3.9 API email catalogs ×5 (change 26 layer): dispute-opened copy branches on `disputeKind` (coach: evidence + respond-by date; player: on hold + refund date); completeness test still green

## 4. Web

- [ ] 4.1 Player confirmation banner: evidence line first (never joined / joined N min late / short overlap), then actions; vitest
- [ ] 4.2 Dispute form: reason category select, text optional except "other"; validation messages; vitest
- [ ] 4.3 System-dispute state on the player card (on hold, refund countdown or "an admin will decide", confirm action) and on the coach card (evidence, deadline, respond form, submitted statement); vitest
- [ ] 4.4 Game: coach two-option answer replaces the single confirm; countdown hidden while the coach is silent; vitest
- [ ] 4.5 Room waiting note (role-specific copy, after `startsAt` + 10 min, disappears when the counterpart connects, no action); vitest with fake timers
- [ ] 4.6 Admin disputes: kind badge + filter, summary above raw rows, coach response, auto-resolve deadline, previous no-show count, resolved-via label; vitest
- [ ] 4.7 Catalog keys ×5 (`sessions.confirmation.*`, `sessions.dispute.*`, `room.waiting.*`, `admin.disputes.*`); catalog-drift test green

## 5. Verification

- [ ] 5.1 e2e (settlement suite, signed test webhooks + moved clock): player connected / coach absent → `disputed` `COACH_NO_SHOW`; no response → `resolved` + `REFUNDED` exactly once after the window
- [ ] 5.2 e2e: coach responds → dispute stays open, no money moves until an admin resolves
- [ ] 5.3 e2e: coach connected / player absent → no dispute, `completed_paid` + release at auto-confirm; both connected → existing UC-CNF cases unchanged
- [ ] 5.4 e2e: no rows → `NO_ATTENDANCE` auto-refund; coach join row without `connectedAt` → `EVIDENCE_GAP` still open after the window
- [ ] 5.5 e2e: player confirms on a system dispute → `resolved` + release; player confirms after `PLAYER_NO_SHOW` → release
- [ ] 5.6 e2e: `NO_SHOW_AUTO_RESOLVE=false` → disputes open, never auto-resolve
- [ ] 5.7 e2e: game — coach answered → release at 48 h; silent coach → no release at 48 h, admin dispute after 7 days
- [ ] 5.8 e2e: classification runs once; duplicate/late webhook after classification changes nothing
- [ ] 5.9 Lint, tsc, api unit + e2e, web vitest green; browser smoke of the player banner, coach respond form and admin queue in `en` + `ru`
- [ ] 5.10 Roadmap entry 27 in `openspec/project.md`; staging: deploy with auto-resolve off, two-account manual check from the issue, enable, then archive
