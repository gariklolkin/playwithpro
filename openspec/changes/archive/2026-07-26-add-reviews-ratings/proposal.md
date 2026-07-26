# Proposal: add-reviews-ratings

## Why

Coaches are booked blind today: the catalog and coach pages show prices and languages but no signal of quality, even though the design (catalog cards, coach profile, coach dashboard) has always reserved space for ratings and reviews. With change 9 the session lifecycle now reaches the terminal paid states (`completed_paid`, `resolved`), so review eligibility can finally be gated on "service delivered and paid out" — the natural moment to build post-session reviews.

## What Changes

- Players can leave one review (1–5 star rating + optional text) per session once the coach was actually paid for it — i.e. the session's escrow ended **released** (`completed_paid`, or `resolved` with the release outcome). Refunded sessions are not reviewable.
- Reviews are immutable in MVP: no edit or delete by users; admin moderation is deferred to `add-admin-console` (roadmap 11).
- Coach aggregate rating (average + review count) is maintained on the pro profile and displayed on catalog cards, the public coach page, and the coach dashboard stats.
- Public reviews list on the coach page: rating, text, player display name, service type, date — visible to anonymous visitors, paginated.
- Past-session list entries gain a "leave a review" affordance when eligible and show the given rating once reviewed.
- All new surfaces localized in the five locales (next-intl catalogs, viewer timezone for dates).

## Capabilities

### New Capabilities

- `reviews`: post-session player reviews — eligibility rules, one-per-session invariant, aggregate rating maintenance, public visibility, localization.

### Modified Capabilities

- `pro-catalog`: catalog entries and the public coach profile additionally expose the aggregate rating (average + count) and the coach page gains the public reviews list.
- `booking`: "Session lists for both parties" — eligible past entries offer the leave-review action; reviewed entries show the given rating.

## Impact

- **DB**: new `Review` model (1:1 with `Session`, denormalized `proProfileId` for listing); aggregate columns (`ratingAvg`, `ratingCount`) on `ProProfile` updated in the same transaction as review creation; one Prisma migration.
- **API** (`apps/api`): new `reviews` module — `POST /sessions/:id/review` (player only, eligibility-guarded), public `GET /pros/:id/reviews` (paginated); catalog/coach/profile and session responses extended with rating/review fields.
- **Web** (`apps/web`): review form (from past-session entry), star rating display component, reviews section on the coach page, rating on catalog cards and dashboard stats; message catalogs for en/fr/de/ru/zh.
- **Shared** (`packages/shared`): review types + rating fields on existing response types.
- **Tests**: unit tests for eligibility/aggregates, e2e covering the full flow (book → pay → progress → confirm → review → aggregates visible publicly).
