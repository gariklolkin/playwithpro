## Why

A coaching session cannot be moved: the only answer to illness, work or travel is cancel-and-rebook, which puts the slot back on the market, makes the player pay again inside the 15-minute window, and — since the cancellation policy — can cost the player half the price for a change both sides wanted. Second half of GitHub issue [#6](https://github.com/gariklolkin/playwithpro/issues/6), building on `add-cancellation-policy`.

## What Changes

- **Mutual reschedule proposals.** Either party of a `paid_escrow` session starting at least 2 hours from now proposes 1–3 of the coach's open slots (same duration, each starting ≥ 2 h from now and within 30 days of the original start). One open proposal per session.
- **Held options.** Offered slots are claimed atomically (`OPEN → BOOKED`, linked to the proposal) so nobody else can take them while the other side decides; they are released on decline, withdrawal, expiry, or when another option is accepted.
- **Response.** The other party accepts one option or declines; the proposer can withdraw. A proposal expires at the earlier of 24 hours after creation or 2 hours before the original start; the booking then stays as it was.
- **Acceptance is one transaction:** the proposal becomes accepted; the session's slot, start and end move to the chosen option; the old slot reopens if it is still ≥ 2 h away; the other options are released. Escrow stays held with no new payment; price, fee and cancellation-policy snapshots, room slug, clips, goal and (for games) the venue are untouched; clips stay editable until the new start.
- **Limits:** at most 2 accepted reschedules per session (`RESCHEDULE_MAX_PER_SESSION`); cancelling or the session starting closes an open proposal.
- **Calendar:** both parties get an `.ics` `REQUEST` with the same UID and a higher `SEQUENCE` through the existing `CalendarProvider.sendUpdate`; reminders are re-armed for the new time.
- **Cancellation interplay (no loophole, no trap):** a reschedule accepted inside the free-cancellation window freezes the player's tier — a later player cancellation never gets a better tier than it had at acceptance; and while a *coach-initiated* proposal is open, or after one was declined or expired, a player cancellation is always a full refund.
- **History:** every proposal is kept (`SessionReschedule` + options: proposer, options, status, timestamps, from/to times) and shown to admins on the session's ledger row.
- **UI:** "Propose a new time" next to "Cancel session" (and as the suggested alternative in the coach's cancel dialog); a slot picker limited to valid options; a pending-proposal banner on the list entry and in the room pre-join for both parties with local times, accept / decline / withdraw and the expiry countdown. All strings ×5 locales.
- **Notifications (existing outbox):** proposed, accepted (the calendar update), declined, withdrawn, expired — five new kinds with catalogs ×5.

Out of scope: rescheduling to another coach, service, duration or price; anything after the session starts; automatic handling of a suspended coach's sessions.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `booking`: reschedule proposals, acceptance, limits, expiry, the cancellation interplay, the reschedule surfaces.
- `availability`: slots held by a reschedule proposal.
- `calendar-invites`: the time-change update on acceptance.
- `admin-console`: reschedule history on the ledger row.

## Impact

- **DB (migration `add_session_rescheduling`):** `SessionReschedule` (session, proposer, role, status `OPEN|ACCEPTED|DECLINED|WITHDRAWN|EXPIRED|SUPERSEDED`, `fromStartsAt/fromEndsAt`, `expiresAt`, `acceptedOptionId`, `respondedAt`), `SessionRescheduleOption` (slot, start, end); `Session.rescheduleCount`, `rescheduledAt`, `cancelTierFloor`; six `NotificationKind` values.
- **API:** new `ReschedulesService` + controller in the bookings module (`POST /sessions/:id/reschedule`, `…/accept`, `…/decline`, `…/withdraw`), expiry sweep; `cancellation-policy.ts` gains the tier floor and the coach-proposal rule; session mapper exposes `reschedule` (open proposal) and `rescheduleAllowed`; reminder scan re-arms after a move; env `RESCHEDULE_MAX_PER_SESSION` (2), `RESCHEDULE_PROPOSAL_TTL_HOURS` (24), `RESCHEDULE_MAX_SHIFT_DAYS` (30).
- **Shared types:** `RescheduleStatus`, `RescheduleProposal`, `RescheduleOption`, `ProposeRescheduleRequest`, `AcceptRescheduleRequest`; `SessionResponse`, `SessionRoomResponse`, `AdminPaymentItem` extended.
- **Web:** session actions (propose dialog with slot picker, banner), room pre-join banner, admin ledger history; catalogs ×5.
- **Risk:** slot double-use and orphaned held slots — every transition is a conditional update inside one transaction, and the expiry sweep releases anything left behind.
