## 1. Data model & payment port

- [x] 1.1 Prisma migration: `SessionStatus` (full lifecycle + `CANCELLED`) and `PaymentStatus` enums; `Session` model (player, proProfile, service snapshot: type/priceMinor/currency/platformFeeMinor, unique `slotId`, nullable `videoId`, `startsAt`/`endsAt`, `expiresAt`, status, indexes for party lists) and `Payment` model (sessionId, provider, providerRef, amountMinor, currency, status, timestamps)
- [x] 1.2 `PaymentProvider` interface (`hold`/`release`/`refund`) + `MockPaymentProvider` (instant hold, fake ref, simulate-decline flag) wired via DI token; config: `PLATFORM_FEE_PERCENT` (10), `BOOKING_PAYMENT_TTL_MIN` (15)
- [x] 1.3 Unit tests: fee rounding, mock provider hold/decline

## 2. Catalog API

- [x] 2.1 `catalog` module: `GET /pros` — verified only, filters (language, serviceType, maxPriceMinor), pagination, price-from, grouped next-open-slot query (no N+1); `GET /pros/:id` public profile (verified-or-404, active services incl. game venue)
- [x] 2.2 Unit/e2e tests: filtering, unverified exclusion, next-slot correctness against the 2h lead-time rule

## 3. Booking & payments API

- [x] 3.1 `bookings` module: `POST /bookings` — validate active service of a verified pro, listable slot, video rules for `video_analysis` (owner + READY, forbidden otherwise); transaction: conditional slot claim (`OPEN→BOOKED`, 0 rows → 409) + session create in `PENDING_PAYMENT` with snapshots and `expiresAt`
- [x] 3.2 `GET /sessions` (role-aware upcoming/past, party-only) and `GET /sessions/:id` (party-or-404, inline expiry check)
- [x] 3.3 `POST /sessions/:id/pay` — player-only, transactional: deadline + status re-check, provider `hold`, `Payment` record, `PENDING_PAYMENT→PAID_ESCROW`; failed hold recorded, session stays payable; late pay → 409 + cancel + slot release
- [x] 3.4 Expiry sweep (5-min in-process cron + startup run): cancel expired `PENDING_PAYMENT` sessions, reopen slots only when still claimable
- [x] 3.5 Per-session coach access in `videos.service`: playback/metadata for pro party of `PAID_ESCROW`+ non-cancelled session; owner-only for list/rename/delete/download (regression tests)
- [x] 3.6 API e2e: full booking→pay→escrow flow, concurrent slot claim, expiry release, double pay, simulated decline + retry, foreign video, coach video access matrix

## 4. Web: catalog & coach profile

- [x] 4.1 `/{locale}/coaches` catalog page: filter sidebar (language, service, max price), coach cards per DESIGN.md (avatar, verified badge, languages, services, price-from, next slot in viewer tz), 2→1 col <900px, pagination
- [x] 4.2 `/{locale}/coaches/[id]` public profile: bio, languages, service/price rows (game venue with 📍), sticky booking panel → bottom sheet on mobile

## 5. Web: booking flow & sessions

- [x] 5.1 Booking panel: service selection → week slot picker (viewer tz, "(your time)" label) → video attachment step for video_analysis (READY videos, empty-state link to upload) → create booking, handle 409 slot-taken with refresh
- [x] 5.2 `/{locale}/booking/[sessionId]` checkout: order summary, escrow notice, payment-deadline countdown, mock pay CTA + dev decline toggle; success → sessions list; decline/expiry states
- [x] 5.3 `/dashboard/sessions`: role-aware upcoming/past lists (other party, service, local time, escrow status tag; coach sees attached-video link)
- [x] 5.4 Message catalogs for all new UI in en/fr/de/ru/zh

- [x] 5.5 Owner follow-up: remove the "My videos" summary card and "My sessions" stub from the player profile page — videos and sessions live only on their dashboard tabs (delta spec on `player-profiles`)

## 6. Verification & docs

- [x] 6.1 Full test suite green (`pnpm turbo test`, lint, typecheck); browser smoke of catalog→book→pay→dashboard in Tilt
- [x] 6.2 Update `openspec/project.md` roadmap notes if decisions shifted; check off tasks; ready for archive
