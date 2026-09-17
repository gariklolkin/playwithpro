## Context

`AvailabilitySlot.status` is `OPEN | BOOKED | …`; booking claims a slot with a conditional `OPEN → BOOKED` update and the session stores `slotId`, `startsAt`, `endsAt` (snapshots). `Session.calendarSequence` and `CalendarProvider.sendUpdate` exist since change 26 (unused so far). Change 28 computes cancellation terms from the session row in `cancellation-policy.ts` and notes that `startsAt` was immutable while `PAID_ESCROW` — this change makes it mutable, so the cancel path must stay correct when a move and a cancel race.

## Goals / Non-Goals

**Goals:** move a paid session by mutual agreement without touching the money; no slot can be double-used or left held; correct interplay with the cancellation tiers; a calendar update both clients understand; history for admins.

**Non-Goals:** changing coach, service, duration or price; post-start changes; bulk moves for a suspended coach.

## Decisions

### D1. Two tables, slots held as ordinary `BOOKED`
`SessionReschedule` is the proposal; `SessionRescheduleOption` rows link it to 1–3 `AvailabilitySlot`s (with `startsAt/endsAt` snapshots for history after a slot is deleted). An offered slot is claimed with the same conditional `OPEN → BOOKED` update booking uses — every existing reader (public listing, materialization, the coach's editor) already treats `BOOKED` as unavailable, so no new slot status and no new code path can forget about a hold. "Who holds it" is answered by the option row; the coach's availability editor labels such a slot "held for a reschedule" instead of showing a session.

*Alternative considered:* a `HELD` slot status — rejected: every slot query would need to learn it.

### D2. One open proposal per session — enforced by the database
A partial unique index `("sessionId") WHERE status = 'OPEN'` (raw SQL in the migration; Prisma cannot express it) makes a second concurrent proposal fail with a unique violation → `409`. No application-level check-then-insert race.

### D3. Every transition is a conditional update in one transaction
- **Propose:** validate (session `PAID_ESCROW`, start ≥ now + 2 h, `rescheduleCount < max`, options distinct, belong to the coach, same duration, start ≥ now + 2 h, within ±30 d of the original start, not the current slot) → tx: create the proposal (unique index guards), claim each slot `OPEN → BOOKED` (any miss → rollback, `409 slot no longer available`), create options, enqueue `RESCHEDULE_PROPOSED` for the other party. `expiresAt = min(now + TTL, startsAt − 2 h)`.
- **Accept (other party only):** tx: `reschedule.updateMany({ id, status: OPEN, expiresAt > now } → ACCEPTED)`; `session.updateMany({ id, status: PAID_ESCROW, slotId: <old>, startsAt: <old> } → new slot/start/end, rescheduleCount + 1, rescheduledAt, calendarSequence + 1, cancelTierFloor)`; release the other options' slots and — if still ≥ 2 h away — the old slot (`BOOKED → OPEN`, conditional); enqueue the two accepted kinds. Any zero count → rollback + `409`. The session update's `where` on the *old* `slotId/startsAt` is what makes an accept racing a cancel (or a second accept) lose cleanly.
- **Decline / withdraw / expire / supersede:** `updateMany({ id, status: OPEN } → …)` then release all option slots (each `BOOKED → OPEN` conditional on the slot still being held by this proposal, i.e. not referenced by the session).
- **Cancel (change 28's `cancelPaid`)** and the **start-time progression** close an open proposal as `SUPERSEDED` and release its slots in their own transactions; the expiry sweep (minute cron, guarded first query) additionally releases anything a crash left behind: proposals `OPEN` past `expiresAt`, or `OPEN` on sessions no longer `PAID_ESCROW`.

### D4. The cancel path re-reads inside its guard
`cancelPaid` computed terms from the row read before the transaction. With a mutable `startsAt` its conditional update gains `startsAt: <as read>` — if an accept moved the session in between, the cancel loses with `409` and the client re-reads (the dialog's amounts were for the old time anyway). Symmetric to D3's accept guard.

### D5. Cancellation interplay lives in the pure policy module
`cancellationTerms` gains two inputs:
- `tierFloor: CancellationTier | null` — written at acceptance as the tier the player would have got by cancelling at that moment, when it is worse than `FREE`. The player's tier is `worse(computed, floor)`. Moving a session from "tomorrow" to "next week" therefore cannot buy back a free cancellation. A later acceptance never improves the floor (`worse(old, new)`).
- `coachProposalOutstanding: boolean` — true while a coach-initiated proposal is `OPEN`, or the latest coach-initiated proposal ended `DECLINED` or `EXPIRED` and none was accepted since. Then the player's tier is `FREE` (the coach signalled they cannot make the time; the player must not pay for that). The floor does not override this rule.
Both are derived from the session row + its latest proposals and unit-tested with the other boundaries.

### D6. Calendar and reminders
Acceptance bumps `calendarSequence` and enqueues `RESCHEDULE_ACCEPTED_PLAYER/COACH`, which the dispatcher routes to `CalendarProvider.sendUpdate` (REQUEST, same UID, the new sequence) with the existing `session_updated.*` templates extended by the old time. Reminder kinds are keyed `kind:session:recipient`; after a move they must fire again for the new time, so `EnqueueInput` gains an optional `dedupeSuffix` and the reminder scan (a) keys reminders `…:seq<calendarSequence>` once a session was moved and (b) treats a session as "booked inside the window" relative to `max(inviteSentAt, rescheduledAt)`.

### D7. API shape
- `POST /sessions/:id/reschedule { slotIds: string[1..3] }`, `POST /sessions/:id/reschedule/accept { optionId }`, `…/decline`, `…/withdraw` → `SessionResponse`.
- `SessionResponse.reschedule: { id, proposedBy: 'player'|'coach', mine: boolean, options: [{ id, startsAt, endsAt }], expiresAt, fromStartsAt } | null` (open proposal only), `rescheduleAllowed: boolean` (paid, ≥ 2 h ahead, under the limit, none open), `rescheduleCount`.
- `SessionRoomResponse.reschedule` — same shape for the pre-join banner.
- Option candidates come from the existing public `GET /pros/:id/slots` (already ≥ 2 h, open only); the client filters by duration and the ±30 d bound, the server re-validates.
- `AdminPaymentItem.reschedules: [{ proposedBy, status, fromStartsAt, toStartsAt | null, createdAt, respondedAt }]`.

## Risks / Trade-offs

- [A player holds three of a coach's slots for up to 24 h] → at most one open proposal per session, options released on every exit, 24 h TTL capped by the start; acceptable for MVP, measurable (accepted vs declined vs expired).
- [Partial unique index is outside the Prisma schema] → documented in the migration and the model comment; `prisma migrate diff` ignores it (no drift noise) — verified in tasks.
- [Accept racing the 2-hour boundary] → all time checks use the API clock inside the transaction; a late accept gets `409`.
- [Reminder already sent for the old time] → a second reminder for the new time is correct behaviour, not a duplicate.

## Migration Plan

Additive migration. Rollback: old code ignores the new tables; open proposals would keep slots `BOOKED` — run the documented release query (`UPDATE "AvailabilitySlot" … WHERE id IN (options of OPEN proposals)`) before rolling back.
