# add-booking-escrow — Proposal

## Why

The marketplace can verify coaches, publish their availability, and store player videos, but an amateur still cannot book or pay for a session — the core value loop (roadmap change 7) is unrealized. This change adds the discovery-to-payment path: find a verified coach, book an open slot, and pay with funds held in escrow.

## What Changes

- **Public coach catalog** — list verified coaches with filters (language, service type, price), coach cards with price-from and next free slot; public coach profile page (bio, services & prices, venue for in-person game).
- **Booking flow** — from a coach's profile: pick a service → pick an open slot → for `video_analysis`, attach a READY video from the player's library → order summary (price + platform fee) → pay. Creates a `Session` with lifecycle `draft → pending_payment → paid_escrow` (later states belong to changes 8–9; the full state enum is defined now).
- **Slot claiming** — booking atomically claims an `OPEN` availability slot (`OPEN → BOOKED`); concurrent booking of the same slot is safe; unpaid sessions expire and release the slot back to `OPEN`.
- **Payments with escrow** — `PaymentProvider` abstraction (`hold` / `release` / `refund`) with a mock provider for MVP; `Payment` records in integer minor units + ISO 4217 currency; platform fee computed and recorded at booking time.
- **Per-session video access** — the coach of a `video_analysis` session can view/play the attached video; the player's library otherwise stays owner-only.
- **Dashboard session lists** — upcoming/past sessions for both roles with status and escrow indicators (session room, calendar invites, confirmation come in changes 8–9).
- All new UI localized in the 5 message catalogs; e2e coverage for the booking/payment flow (mandatory before archive).

Out of scope: session rooms / Jitsi / calendar invites (change 8), confirmation, release/refund execution, disputes (change 9), reviews (change 10).

## Capabilities

### New Capabilities
- `pro-catalog`: public discovery — verified-coach catalog with filtering and the public coach profile view.
- `booking`: session creation and lifecycle through escrow (`draft → pending_payment → paid_escrow`), slot claiming/release, video attachment, dashboard session lists.
- `payments`: `PaymentProvider` escrow abstraction, mock provider, payment records, platform fee.

### Modified Capabilities
- `video-library`: access rule changes — the coach of a session gains read/playback access to the video attached to that session (library stays owner-only otherwise).

## Impact

- **DB (Prisma):** new `Session`, `Payment` models; `SessionStatus`, `PaymentStatus` enums; relations to `User`, `ProService`, `AvailabilitySlot`, `Video`.
- **API (NestJS):** new `catalog` (public pros), `bookings`, `payments` modules; `videos` service gains per-session access checks; slot-claim logic touches `availability` data (spec unchanged).
- **Web (Next.js):** new public routes (coach catalog, coach profile + booking panel), checkout/payment step, dashboard session lists for player and coach; message catalog additions in all 5 locales (full web-image rebuild in Tilt).
- **Providers:** first `PaymentProvider` implementation (mock); no vendor binding in business logic.
