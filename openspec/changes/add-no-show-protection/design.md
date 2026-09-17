## Context

Money flow today: `SessionProgressionService` moves paid sessions by clock (`paid_escrow → in_progress → awaiting_confirmation`) and, 48 h after `endsAt`, to `completed_paid`; `SettlementService.settle()` then moves the payment exactly once according to the terminal status. `DisputesService.open` flips `awaiting_confirmation → disputed` with a conditional update and `resolve` flips `disputed → resolved` the same way. Attendance evidence (`SessionAttendance`: `joinedAt` from the join action, `connectedAt`/`leftAt` from signed LiveKit webhooks) is collected but only displayed to admins. `GAME` sessions have no room and no evidence. Notification emails for disputes are already enqueued by `DisputesService` through the outbox of change 26.

Constraints: exactly-once money movement must survive concurrent actors (sweep, player, admin); a media-server or webhook outage must never cause mass refunds; every cron entry point guards its first query (CI deadlock lesson); no business logic bound to LiveKit.

## Goals / Non-Goals

**Goals:**
- The default payout follows the evidence for online sessions; clear coach no-shows refund without a complaint.
- Every automatic money decision goes through the existing dispute → resolve → settle path, so there is one audited way money moves.
- Coaches are protected from missing evidence (gap outcome, response window, kill switch).
- Games get a minimal honest gate: the coach must say something before being paid by default.

**Non-Goals:**
- Partial refunds, new email templates, sanctions, geo/QR check-in, coach-initiated disputes (see proposal).
- Real-time presence infrastructure: the waiting note uses what the room already knows.

## Decisions

### D1. Classification is a pure function over attendance rows, stored once
`classifyAttendance({ startsAt, endsAt, windowBeforeMin, windowAfterMin, playerId, coachId, rows }) → { outcome, partial, playerFirstConnectedAt, coachFirstConnectedAt, overlapMinutes }` lives in `session-rooms/attendance-classifier.ts` with no I/O. Overlap merges each party's `[connectedAt, leftAt ?? windowEnd]` intervals (clamped to the join window) and intersects the two unions. The same function produces the party-facing summary before classification (outcome `null`) and the stored outcome afterwards — one definition of "connected".

Stored on `Session`: `attendanceOutcome` (enum, null = not classified), `attendancePartial`, `classifiedAt`. The summary's times and overlap are recomputed on read (cheap: a handful of rows, already loaded for parties) rather than denormalized; only the *decision* is frozen. *Alternative considered:* store the full summary JSON — rejected, it duplicates evidence and late `leftAt` webhooks would make it stale while being harmless to recompute.

### D2. Classification runs in the progression sweep only, not on read paths
The sweep already owns time-driven transitions and runs every minute; a `classifyDue()` step selects `awaiting_confirmation` online sessions with `classifiedAt IS NULL` and `endsAt <= now - (afterWindow + buffer)`. Read paths are **not** extended: classification opens disputes and enqueues emails, which is too heavy for a GET, and a minute of latency is irrelevant on a 48 h horizon. The one read-path interaction: inline auto-confirm must not complete an unclassified online session, so `progressedStatus()` returns `awaiting_confirmation` for online sessions unless `attendanceOutcome ∈ {HELD, PLAYER_NO_SHOW}`. Since classification is due ~35 min after `endsAt` and auto-confirm at 48 h, an unclassified session at the deadline only happens after long downtime; the sweep order (`classifyDue` → `autoConfirm`) handles it.

### D3. Outcome and dispute are written in one transaction, guarded by the status
```
tx: updateMany Session where id, status = AWAITING_CONFIRMATION, classifiedAt = null
      → set outcome, partial, classifiedAt (+ status = DISPUTED for the three dispute outcomes)
    if count = 1 and outcome needs a dispute → create Dispute(kind, openedById null, responseDueAt?) + enqueue notifications
```
The conditional update is the same race guard `DisputesService.open` uses, so a player who confirms or disputes in the same instant simply wins and the classifier's update matches zero rows (the session is then left unclassified on purpose — classification only matters while awaiting confirmation). `Dispute.sessionId` stays unique as the second line of defence.

### D4. One resolve path with an explicit actor
`DisputesService.resolve(disputeId, outcome, actor, note?)` where `actor = { type: 'admin', userId } | { type: 'system' } | { type: 'player', userId }`. All three keep the existing conditional `OPEN → RESOLVED` update followed by `SettlementService.settle()`. New column `Dispute.resolvedVia` (`ADMIN | SYSTEM | PLAYER_CONFIRMATION`); `resolvedById` stays null for system, and is the player for a confirmation withdrawal. The system note is stored as a code (`systemNoteCode = 'NO_COACH_RESPONSE'`) and rendered from catalogs — no English sentence in the DB. *Alternative:* a dedicated system user row as resolver — rejected: a fake user leaks into admin lists and auth.

### D5. Auto-resolution is a sweep over `responseDueAt`
`DisputesService.autoResolveDue()` (called from the settlement sweep tick, guarded): `status = OPEN AND responseDueAt <= now AND coachRespondedAt IS NULL AND kind IN (COACH_NO_SHOW, NO_ATTENDANCE)` → `resolve(…, REFUND, system)`. A coach response sets `coachRespondedAt` and nulls `responseDueAt` in one conditional update (`coachRespondedAt IS NULL AND status = OPEN`), so response-vs-deadline is decided by whichever conditional update lands first. `NO_SHOW_AUTO_RESOLVE=false` means `responseDueAt` is never set at opening **and** the sweep is a no-op — flipping the switch off also freezes already-open disputes. Index `(status, responseDueAt)`.

### D6. Games: the coach answer reuses `coachConfirmedAt`
`Session.coachGameAnswer` (`TOOK_PLACE | PLAYER_ABSENT`, null) is written together with `coachConfirmedAt` by `POST /sessions/:id/confirm` with body `{ gameAnswer }` (required for a coach on a `GAME`, rejected otherwise). `progressedStatus()` gates game auto-confirm on `coachConfirmedAt != null`; `autoConfirmAt` is returned as null to clients while the coach is silent. The 7-day step lives in the same `classifyDue()` sweep: games `awaiting_confirmation`, `coachConfirmedAt IS NULL`, `endsAt <= now - GAME_UNANSWERED_DISPUTE_DAYS` → system dispute `NO_ATTENDANCE`, no `responseDueAt`, `attendanceOutcome` left null (there is no attendance to classify). A coach who answers after the 48 h deadline but before day 7 is paid on the next sweep tick.

### D7. Player dispute shape
`OpenDisputeDto { category: DisputeReasonCategory; reason?: string }` — `reason` required (min length as today) only for `OTHER`. DB: `Dispute.reasonCategory` nullable (null for system disputes and historical rows), `reason` becomes nullable. Existing rows get `kind = PLAYER_REPORTED`, `reasonCategory = OTHER` in the migration. **BREAKING (API):** the web form is the only client, shipped together.

### D8. API surface
- `SessionResponse.attendance?: AttendanceSummary` (online only), `SessionResponse.coachGameAnswer`, `autoConfirmAt: string | null`.
- `DisputeSummary` += `kind`, `reasonCategory`, `responseDueAt`, `coachResponse`, `coachRespondedAt`, `resolvedVia`, `systemNoteCode`. The coach response text is visible to both parties and admins.
- `POST /sessions/:id/dispute/response { statement }` (coach only, 20–2000 chars, throttled).
- `GET /admin/disputes?kind=` ; `AdminDisputeItem` += summary, `coachPreviousNoShows` (count of that coach's `COACH_NO_SHOW` disputes with `outcome = REFUND`, one grouped query per page, not per row).

### D9. Waiting note needs no new backend
The room already has LiveKit's remote-participant state. The note is a client component: `now > startsAt + 10 min && remoteParticipants.length === 0 && status === 'in_progress'`, re-evaluated on a 30 s tick and on participant events. Copy differs by role. No server push, no new endpoint.

### D10. Notifications and analytics
System opening reuses `DISPUTE_OPENED_PLAYER/COACH/ADMIN` kinds; the payload gains `disputeKind` so the existing templates can branch copy (coach: "respond by …"). Template wording changes are catalog edits inside the API catalogs of change 26, not new kinds. `dispute.resolved.*` already fires from the scan once the payment settles, regardless of actor. Analytics: `session_classified { outcome, partial, serviceType }`, `dispute_auto_resolved { kind }`, `dispute_coach_responded { kind }` through the `ANALYTICS` port (no-op without a key).

## Risks / Trade-offs

- [Webhook loss or LiveKit outage looks like a coach no-show] → a coach who *pressed join* always has a join row, which turns the case into `EVIDENCE_GAP` (admin, no auto-refund). Only a coach with no trace at all is auto-refundable, and even then after a 48 h response window and an email. Kill switch for the rest.
- [Webhook endpoint down for everyone: player has join row but no `connectedAt`, coach no rows] → falls into `EVIDENCE_GAP` by the "every other case" rule (player not connected, a join entry exists), never `COACH_NO_SHOW`.
- [Player-side false `PLAYER_NO_SHOW`: player attended via another app after a broken call] → the coach is paid, which matches reality; the player can still dispute within 48 h.
- [Both parties met off-platform → `NO_ATTENDANCE` → auto-refund although the session happened] → the coach gets the dispute email and a one-field respond form; the player can confirm to release. Accepted for MVP; measured by the "contested and admin sides with coach" hypothesis.
- [Games with silent coaches accumulate for 7 days] → acceptable: money is safe in escrow; the ended-session email of change 26 prompts the coach.
- [More dispute rows in the admin queue from gaps] → kind filter; `EVIDENCE_GAP` rate is one of the release hypotheses.
- [Breaking dispute DTO] → single client, deployed atomically with the API.

## Migration Plan

1. Migration `add_no_show_protection` (additive columns + enum types; backfill `Dispute.kind = PLAYER_REPORTED`, `reasonCategory = OTHER`, `resolvedVia = ADMIN` where resolved). Sessions already `awaiting_confirmation` at deploy time with a closed join window are classified by the first sweep — acceptable pre-launch (no real users); on staging verify the count first with a dry-run log line.
2. Deploy with `NO_SHOW_AUTO_RESOLVE=false` on staging, run the manual two-account check from the issue, then enable.
3. Rollback: set `NO_SHOW_AUTO_RESOLVE=false` (stops money decisions immediately); a code rollback leaves additive columns in place, open system disputes remain resolvable by the old admin flow because `openedById` nullability is the only shape change the old code reads — old admin list code must tolerate it, so the rollback target is this change's predecessor **plus** the null-safe opener patch (task 1.3 lands first and separately deployable).

## Open Questions

- Both-absent default is **refund** (issue's recommendation). Owner to confirm, alternative is release.
- Overlap < 50 % stays a flag, not a gap. Revisit with real data.
