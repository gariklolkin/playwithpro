## Why

A coach who never shows up still gets paid: 48 hours after `endsAt` the auto-confirm sweep releases escrow regardless of who attended, the attendance evidence we already collect (join rows plus signed LiveKit connect/leave webhooks) is visible only to admins inside a dispute, and the whole burden of stopping the payout sits on a player who must notice in time and write a complaint. Escrow has to protect the player by default before a real payment provider makes released money hard to recover (GitHub issue [#4](https://github.com/gariklolkin/playwithpro/issues/4)).

## What Changes

- **Attendance classification (online services).** Once the join window has closed (`endsAt` + `ROOM_JOIN_WINDOW_AFTER_MIN` + a short webhook buffer) the progression sweep classifies each `awaiting_confirmation` video-analysis/consultation session exactly once and stores the result on the session: `HELD`, `PLAYER_NO_SHOW`, `COACH_NO_SHOW`, `NO_ATTENDANCE`, `EVIDENCE_GAP`. A party *connected* if it has an attendance row with `connectedAt` inside the join window. Late/duplicate webhooks never change a stored classification.
- **Partial attendance flag** (coach connected > 10 min after `startsAt`, or overlap < 50 % of the scheduled duration): informational only, never blocks auto-confirm.
- **BREAKING (spec): attendance now drives status.** `COACH_NO_SHOW`, `NO_ATTENDANCE` and `EVIDENCE_GAP` open a *system dispute* through the existing conditional `awaiting_confirmation → disputed` transition, so auto-confirm and payout stop exactly as for a player dispute. `HELD` and `PLAYER_NO_SHOW` keep today's flow (coach paid at auto-confirm). The sentence "Attendance SHALL NOT drive session status transitions" is dropped from `session-rooms`.
- **System disputes.** `Dispute.kind` (`PLAYER_REPORTED | COACH_NO_SHOW | NO_ATTENDANCE | EVIDENCE_GAP`), nullable `openedById`, one coach statement (`coachResponse`, `coachRespondedAt`) within `NO_SHOW_RESPONSE_WINDOW_HOURS` (48). A `COACH_NO_SHOW`/`NO_ATTENDANCE` dispute with no coach response at the deadline is resolved as `REFUND` by the system (null resolver, fixed system note) through the existing exactly-once resolve + settlement path. A response keeps it open for an admin. `EVIDENCE_GAP` never auto-resolves. `NO_SHOW_AUTO_RESOLVE=false` is the kill switch: classification and system disputes still happen, nothing auto-resolves.
- **Player confirmation always wins.** Confirming during `awaiting_confirmation` releases regardless of the classification; confirming on an open *system* dispute resolves it as `RELEASE`. Player-reported disputes keep today's rules.
- **Player dispute reason category** (`COACH_NO_SHOW | COACH_LATE_OR_LEFT_EARLY | TECHNICAL_PROBLEM | OTHER`) with the free text becoming optional unless the category is `OTHER`.
- **In-person games.** The coach's confirmation becomes a required two-option answer ("The game took place" / "The player didn't come"); both lead to payment. Auto-confirm for a `GAME` releases only if the coach has answered; a silent coach leaves the session `awaiting_confirmation`, and 7 days after `endsAt` a `NO_ATTENDANCE` system dispute is opened for an admin with no auto-resolution.
- **Attendance summary in `SessionResponse`** for both parties (first connected time per party, overlap minutes, partial flag, classification) — never raw rows — plus the system-dispute deadline and coach response state.
- **UI (en/fr/de/ru/zh, viewer timezone):** evidence line first in the player's confirmation banner; reason categories in the dispute form; system-dispute state with the refund countdown for the player; coach card with evidence, deadline and a "Respond" form; two-option game confirmation; in-room "hasn't joined yet" notes after `startsAt` + 10 min (no action); admin queue with kind, kind filter, computed summary above the raw rows, coach response, auto-resolve deadline and the coach's previous no-show count.
- **Notifications:** no new email copy here. System-opened and system-resolved disputes feed the existing outbox kinds of `add-session-lifecycle-notifications` (dispute opened → player/coach/admin, resolved → both parties); the dispute-opened coach email for a system dispute points at the respond form.

Out of scope: partial refunds or pro-rated payouts, cancellation cutoffs / rescheduling (issue #6), new email templates, automatic sanctions for repeat no-shows (only the count is recorded), geolocation/QR check-in for games, coach-initiated disputes, the real payment provider.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-rooms`: attendance logging no longer forbids status effects; new requirements for attendance classification, the per-party attendance summary, and the in-room waiting note.
- `session-confirmation`: auto-confirm gated by classification and, for games, by the coach's answer; the coach's game answer; player confirmation overriding the classification and withdrawing a system dispute.
- `disputes`: dispute kinds and system-opened disputes, reason categories, coach response window, system auto-resolution with a kill switch, party-facing system-dispute state, admin queue summary/filter/no-show count.

The `i18n` capability itself does not change: its complete-catalog requirement already covers the new keys, and the localization rules for the new surfaces live in the three capabilities above.

## Impact

- **DB (one migration `add_no_show_protection`):** `Session.attendanceOutcome`, `attendancePartial`, `classifiedAt`, `coachGameAnswer`; `Dispute.kind`, `reasonCategory`, nullable `openedById` and `reason`, `coachResponse`, `coachRespondedAt`, `responseDueAt`, `resolvedVia`, `systemNoteCode`; index for the auto-resolve scan.
- **API:** new `AttendanceClassifier` (pure) + classification step in `SessionProgressionService`; `DisputesService` gains `openBySystem`, `respond`, `autoResolveDue`, and a system-actor path in `resolve`; `BookingsService.confirm` handles the system-dispute withdrawal and the game answer; `POST /sessions/:id/dispute/response`, `POST /sessions/:id/confirm` body `{ gameAnswer? }`, admin queue `?kind=` filter; env `NO_SHOW_RESPONSE_WINDOW_HOURS`, `NO_SHOW_AUTO_RESOLVE`, `NO_SHOW_CLASSIFY_BUFFER_MIN`, `GAME_UNANSWERED_DISPUTE_DAYS`.
- **Shared types:** `AttendanceSummary`, `AttendanceOutcome`, `DisputeKind`, `DisputeReasonCategory`, `CoachGameAnswer`; `SessionResponse`, `DisputeSummary`, `AdminDisputeItem` extended.
- **Web:** sessions list banner/cards, dispute form, room waiting note, admin disputes; message catalogs ×5.
- **Analytics:** `session_classified` and `dispute_auto_resolved` server events through the existing analytics port so the issue's hypotheses can be measured.
- **Risk:** money now moves (refund) on webhook evidence — mitigated by the evidence-gap outcome, the coach response window, the kill switch and exactly-once settlement.
