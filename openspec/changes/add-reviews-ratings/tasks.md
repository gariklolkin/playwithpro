# Tasks: add-reviews-ratings

## 1. Shared contracts & data model

- [x] 1.1 `packages/shared`: `Review` types (`ReviewResponse`, `CreateReviewRequest`, public review list entry) and rating fields (`ratingAvg`, `ratingCount`) on catalog entry / coach profile / `SessionResponse` (`review`, `reviewable`); export from index
- [x] 1.2 Prisma: `Review` model (1:1 Session via `sessionId @unique`, denormalized `proProfileId` + `playerId`, `rating`, `text?`, `createdAt`; index `(proProfileId, createdAt)`), `ratingSum`/`ratingCount` (default 0) on `ProProfile`; migration `add_reviews_ratings`

## 2. API — review creation & eligibility

- [x] 2.1 `reviews` module: `POST /sessions/:id/review` — party scoping (non-party → 404, coach → 403), DTO validation (rating 1–5 int, text ≤ 2000), inline progression normalization before the eligibility check
- [x] 2.2 Eligibility guard on session status: `COMPLETED_PAID`, or `RESOLVED` with dispute outcome `RELEASED`; everything else → 409; payment status deliberately not consulted
- [x] 2.3 Transactional create: insert review + increment `ratingSum`/`ratingCount` in one transaction; duplicate (unique violation incl. concurrent) → 409
- [x] 2.4 Unit tests: eligibility matrix (each status, refund vs release outcome, stale auto-confirm normalization), duplicate/concurrent conflict, validation, party scoping, aggregate increments

## 3. API — public exposure

- [x] 3.1 `GET /pros/:id/reviews` — public, verified-only (else 404), offset pagination newest-first; entries: rating, text, player display name, service type, session date
- [x] 3.2 Extend catalog + public coach profile responses with `ratingAvg` (one decimal, null when no reviews) and `ratingCount`; extend session mapper with `review` and derived `reviewable`
- [x] 3.3 Unit tests: listing pagination/visibility, aggregate presentation (null vs value), mapper `reviewable`/`review` derivation

## 4. Web — leave a review

- [x] 4.1 `StarRating` component: display mode + accessible input mode (radio group), used everywhere stars appear
- [x] 4.2 Review dialog from past-session entries (`session-actions`/`sessions-list`): shown when `reviewable`, rating required + optional text, error surfacing; reviewed entries show the given stars for both roles
- [x] 4.3 Unit tests for the dialog flow and conditional affordances

## 5. Web — public & dashboard surfaces

- [x] 5.1 Coach page: aggregate header (avg + count, "no reviews yet" state) and paginated reviews section ("load more", newest first, viewer-timezone dates)
- [x] 5.2 Catalog cards: rating aggregate (or "no reviews yet"); coach dashboard stats: rating tile
- [x] 5.3 i18n: message keys for all new surfaces in en/fr/de/ru/zh; no hard-coded strings

## 6. E2E & verification

- [x] 6.1 e2e: full flow — book → pay → progress to `awaiting_confirmation` → confirm → review → aggregate + public listing reflect it; refunded-dispute session rejected with 409; duplicate review 409
- [x] 6.2 Lint, typecheck, full unit + e2e suites green; browser smoke: leave review from sessions list, see it on the public coach page and catalog card
