# Tasks: add-confirmation-payouts-disputes

## 1. Data model & config

- [x] 1.1 Prisma migration: `Dispute` model (`sessionId @unique`, opener, reason, `DisputeStatus OPEN|RESOLVED`, `DisputeOutcome RELEASE|REFUND?`, resolver, admin note, timestamps) + `Session.playerConfirmedAt`/`coachConfirmedAt`
- [x] 1.2 Add `AUTO_CONFIRM_WINDOW_HOURS` (default 48) to env validation and `.env.example` (compose/Tilt rely on the code default, same as the room-window vars)

## 2. Settlement core (API)

- [x] 2.1 `SettlementService` in bookings module: guarded `HELD → RELEASED|REFUNDED` payment transitions around `PaymentProvider.release/refund` (conditional `updateMany`, exactly-once, failure leaves `HELD` + logs)
- [x] 2.2 Settlement sweep: re-settle `HELD` payments of `completed_paid`/`resolved`/refund-owed `cancelled` sessions (periodic + startup, alongside existing sweeps)
- [x] 2.3 Unit tests: exactly-once release/refund, provider-failure retry, no double movement under concurrent settle

## 3. Confirmation & auto-confirm (API)

- [x] 3.1 `POST /sessions/:id/confirm`: player confirm → `completed_paid` + settlement release; coach confirm → evidence timestamp only; idempotent repeats; party-only (not-found for others), conflict outside `awaiting_confirmation`
- [x] 3.2 Auto-confirm in progression sweep: `awaiting_confirmation` past `endsAt + window` (no dispute) → `completed_paid` + settlement; inline read normalization flips status only (no provider call)
- [x] 3.3 Expose computed auto-confirm deadline and both confirmed-at fields in session DTO/mapper
- [x] 3.4 Unit tests: confirm paths, race player-confirm vs sweep, inline normalization without settlement

## 4. Disputes (API)

- [x] 4.1 `disputes` module: `POST /sessions/:id/dispute` (reason required, `awaiting_confirmation` only, one dispute per session, party-only) → `disputed`, auto-confirm stops
- [x] 4.2 Admin endpoints: `GET /admin/disputes` (open + resolved, with parties, amounts, reason, attendance evidence) and `POST /admin/disputes/:id/resolve` (`release|refund` + optional note) → `resolved` + settlement; double-resolution conflict; admin guard
- [x] 4.3 Dispute/resolution surfaced to parties in session DTO (status, reason, outcome)
- [x] 4.4 Unit tests: open/resolve flows, validation, authz, double-resolution

## 5. Paid-session cancellation (API)

- [x] 5.1 `POST /sessions/:id/cancel`: conditional `PAID_ESCROW AND startsAt > now()` → `cancelled`, slot back to `OPEN`, settlement refund, first caller of `sendCancellationIfInvited`; conflict at/after start; party-only
- [x] 5.2 Unit tests: cancel happy path, at/after-start conflict, slot reopened, cancellation email idempotency

## 6. Web

- [x] 6.1 Confirmation banner on session lists/detail for `awaiting_confirmation`: confirm action, report-a-problem action, auto-confirm countdown (`use-now.ts`)
- [x] 6.2 Dispute dialog (reason textarea + validation) and dispute/resolution status display for both parties
- [x] 6.3 Cancel action with confirm dialog on upcoming `paid_escrow` entries; payout/refund status chips on past sessions
- [x] 6.4 Admin dispute queue page beside verification queue: open/resolved lists, session details, attendance evidence, resolve form
- [x] 6.5 next-intl catalog entries for all new strings in en/fr/de/ru/zh

## 7. E2E & verification

- [x] 7.1 e2e: confirm → payout released (payment `RELEASED`, mock log); auto-confirm via sweep; coach-confirm-only leaves escrow held
- [x] 7.2 e2e: dispute → frozen payout → admin release and refund resolutions; double resolution rejected
- [x] 7.3 e2e: pre-start cancel → refund + slot reopened + CANCEL email in Mailpit; post-start cancel rejected
- [x] 7.4 Full check: lint, typecheck, unit, e2e green; browser smoke of confirmation banner, dispute form, admin queue
