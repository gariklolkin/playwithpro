# Design: add-reviews-ratings

## Context

Changes 1–9 delivered the full paid-session lifecycle: sessions now terminate in `completed_paid` (player confirm or 48h auto-confirm) or `resolved` (admin dispute resolution with a recorded `released | refunded` outcome). `SettlementService` is the single money mover; session status is the settled truth while the payment row may briefly lag `HELD` when a provider release fails and awaits the sweep retry. The catalog (`pro-catalog`) and coach page are public and already designed with rating placeholders (design/DESIGN.md screens 2, 3, 5). Session lists (`sessions-list.tsx` + `session-actions.tsx`) already render status-dependent affordances per entry.

## Goals / Non-Goals

**Goals:**
- One player review (1–5 stars + optional text) per session whose escrow outcome was "coach got paid".
- Correct-by-construction invariants: at most one review per session, aggregates never drift from the review rows they summarize.
- Public exposure: aggregate on catalog cards / coach page / dashboard stats; paginated review list on the coach page.
- Localized UI in all five locales.

**Non-Goals:**
- Coach replies to reviews, coaches rating players.
- Editing or deleting reviews (users); admin moderation — deferred to `add-admin-console` (11), which must decrement aggregates when it deletes.
- Catalog sorting/filtering by rating (can be layered on the aggregate columns later).
- Review windows/expiry: an eligible session stays reviewable indefinitely in MVP.
- Anti-abuse beyond the pay-gate (rate limiting, text moderation).

## Decisions

**1. Eligibility gates on session status, not payment status.**
Reviewable iff `status = COMPLETED_PAID`, or `status = RESOLVED` with the dispute outcome `RELEASED`. Refunded sessions (pre-start cancel or dispute refund) are not reviewable — the service is deemed not delivered. Payment status is deliberately not consulted: after a provider release failure the payment can sit `HELD` while the session is already `completed_paid` (settled truth per change 9); the player must not be blocked from reviewing by a retryable payout hiccup. The review endpoint runs the same inline progression normalization as other session read/action paths, so a session past its auto-confirm deadline becomes reviewable in the same request.
*Alternative considered:* gating on `Payment.status = RELEASED` — rejected for the lag above.

**2. `Review` is 1:1 with `Session`, with a denormalized `proProfileId`.**
`Review { id, sessionId @unique, proProfileId, playerId, rating Int (1–5, validated), text String? (≤2000), createdAt }`, index `(proProfileId, createdAt desc)`. The unique constraint on `sessionId` is the one-review invariant — a concurrent double submit loses on the constraint and maps to a conflict. `proProfileId`/`playerId` are copied from the session at creation so the public listing needs no join through Session.

**3. Aggregates as `ratingSum + ratingCount` on `ProProfile`, updated in the review-insert transaction.**
The average is derived in the mapper (`ratingAvg = sum/count`, one decimal), never stored — integer columns cannot drift by float rounding, and increments are trivially transactional (`updateMany`-style increment in the same Prisma transaction as the insert). Catalog and coach-page queries read two extra columns instead of aggregating over reviews.
*Alternatives considered:* live `AVG()` per catalog page — N extra aggregations on the hottest public query; periodic recompute job — eventual consistency and more moving parts for no benefit at MVP scale.

**4. API surface.**
- `POST /sessions/:id/review` — party-scoped like confirm/cancel (non-party → not-found, coach → 403), body `{ rating: 1–5, text? }`, eligibility violations → 409, duplicate → 409. Returns the created review.
- `GET /pros/:id/reviews` — public, verified-profile-only (else not-found, consistent with pro-catalog), offset pagination (same shape as the catalog), newest first; entries: rating, text, player display name, service type, session date.
- Extended responses: catalog entries and the public coach profile gain `ratingAvg`/`ratingCount`; `SessionResponse` gains `review: { rating, text, createdAt } | null` plus a derived `reviewable` flag so the web list doesn't re-implement eligibility.

**5. Web.**
Reusable `StarRating` display + input component (accessible radio group for input). Past-session entries in `sessions-list`/`session-actions` show "Leave a review" when `reviewable`, opening an inline dialog (rating required, text optional), and show the given stars once `review` is present. Coach page gets a reviews section (aggregate header + paginated list, "load more"). Catalog card and coach dashboard stats render the aggregate; zero reviews renders a neutral "no reviews yet" (never a 0.0 score). Player display name is shown as-is (public), matching the name already shown on the coach's session list.

## Risks / Trade-offs

- [Aggregates trust insert-only discipline] → change 11's admin deletion must decrement `ratingSum/ratingCount` in its delete transaction; called out in Non-Goals and the change-11 roadmap entry's context.
- [No review window] → very old sessions can be reviewed, possibly out of context → acceptable at MVP volume; a window is a one-line guard later.
- [Public player names on reviews] → privacy surface widens; mitigated by it being the same display name the player already exposes when booking; revisit if profiles gain privacy settings.
- [Immutable reviews] → typos/regret cannot be fixed by the player → admin moderation in change 11 is the escape hatch.

## Migration Plan

Single additive Prisma migration (`Review` table + two `ProProfile` columns defaulting to 0). No backfill needed — no historical reviews exist. Rollback = revert migration; no data loss risk for existing tables.
