# add-booking-escrow — Design

## Context

Verified coaches publish 60-minute `AvailabilitySlot`s (UTC, `OPEN|BOOKED|REMOVED`, public listing already excludes <2h lead time). Players have profiles and a video library (`Video` with `READY` status, owner-scoped-404 access in `videos.service.ts`). There is no public coach discovery surface, no `Session`, and no payments. Money is integer minor units + ISO 4217; the canonical session lifecycle is
`draft → pending_payment → paid_escrow → in_progress → awaiting_confirmation → completed_paid | disputed → resolved`.
This change implements discovery → booking → escrow hold; session rooms/calendar (change 8) and confirmation/payout/disputes (change 9) build on it.

## Goals / Non-Goals

**Goals:**
- Public catalog + public coach profile for verified pros (language/service/price filters, price-from, next free slot).
- Booking: service + slot (+ READY video for `video_analysis`) → order summary → mock payment → `paid_escrow`; race-safe slot claiming; automatic expiry of unpaid bookings.
- `PaymentProvider` port (`hold`/`release`/`refund`) with a mock implementation; `Payment` audit records; platform fee computed and snapshotted at booking time.
- Coach playback access to the attached video of their paid sessions.
- Dashboard session lists (player + coach) with status/escrow indicators.

**Non-Goals:**
- Session room, Jitsi, attendance, calendar invites (change 8).
- Confirmation, auto-confirm, actual `release`/`refund` execution, cancellation/refund UX, disputes (change 9).
- Reviews/ratings on catalog cards (change 10) — layout leaves room for them.
- Real payment vendor (Stripe Connect candidate) — mock only, behind the port.

## Decisions

### D1. Session states used now: `PENDING_PAYMENT → PAID_ESCROW`, plus `CANCELLED`
The full `SessionStatus` enum is defined now (forward-compat for changes 8–9), but the server never persists `DRAFT`: booking configuration is client-side state, and `POST /bookings` creates the session directly in `PENDING_PAYMENT` while atomically claiming the slot. Rationale: no abandoned draft rows, and a slot is only held once the player commits to pay. `CANCELLED` is added to the enum as the terminal state for unpaid/expired bookings (audit trail instead of row deletion); it extends the canonical machine for pre-payment abandonment only — post-payment cancellation semantics stay in change 9.

### D2. Race-safe slot claiming via conditional update
Inside one Prisma transaction: `updateMany({ where: { id, status: OPEN }, data: { status: BOOKED } })`; affected-count 0 → 409 conflict; then create the session. `Session.slotId` is unique, and expiry reopens the slot (`BOOKED → OPEN`) only when it is still claimable. Booking validates the same >2h lead-time rule the public listing uses. No advisory locks needed at MVP scale.

### D3. Payment expiry: 15-minute TTL + in-process sweep
`PENDING_PAYMENT` sessions carry `expiresAt = now + 15min`. A 5-minute in-process cron (same pattern as the stale-upload sweep — no queue infra) cancels expired sessions and reopens their slots; `pay` and session-detail reads also check `expiresAt` inline so behavior doesn't depend on sweep timing.

### D4. Price and fee snapshotted on the session; fee is coach-side
At booking, copy `priceMinor`/`currency` from `ProService` and `startsAt`/`endsAt`/`serviceType` onto the session (later price/template edits must not affect existing bookings). The player pays exactly the service price; `platformFeeMinor = round(priceMinor × PLATFORM_FEE_PERCENT)` (config, default 10%) is recorded for the change-9 payout (`release − fee`, per DESIGN.md 4.1). The order summary shows the price and the escrow notice; the fee is disclosed on the coach's side.

### D5. `PaymentProvider` port + mock with explicit failure path
`packages`-level interface: `hold(input) → { providerRef } | failure`, `release(ref)`, `refund(ref)` (release/refund implemented by the mock but not exposed via API until change 9). Mock hold succeeds instantly and mints a fake ref; the mock checkout UI offers a "simulate declined payment" toggle (dev-visible) so the failure path is testable end-to-end. `Payment` row per attempt: provider, providerRef, amountMinor, currency, status `REQUIRES_HOLD → HELD | FAILED` (`RELEASED`/`REFUNDED` reserved). Business logic depends only on the port.

### D6. Catalog is a public read model over existing tables
`GET /pros` (verified profiles only): filters `language`, `serviceType`, `maxPriceMinor`; offset pagination; card payload includes displayName, avatar URL, languages, active services with prices (+ venue label for GAME), price-from, and next open slot (min `startsAt` of listable slots). `GET /pros/:id` returns the public profile. No new tables, no search engine — SQL over `ProProfile`/`ProService`/`AvailabilitySlot` is enough at MVP scale.

### D7. Coach video access is session-scoped, from `PAID_ESCROW` onward
`videos.service` playback authorization becomes: owner, OR pro party of a non-cancelled session in `PAID_ESCROW`-or-later that references the video. Library listing, rename, delete, and original download stay owner-only (reuse the owner-scoped-404 pattern). Access begins at payment, not at booking — an unpaid booking grants nothing.

### D8. Web surfaces follow DESIGN.md screens 2–4
New public routes `/{locale}/coaches` (filter sidebar + card grid, 2→1 col <900px) and `/{locale}/coaches/[id]` (profile + sticky booking panel; bottom sheet on mobile; week slot picker rendered in viewer timezone with "(your time)" label). Checkout at `/{locale}/booking/[sessionId]` shows the order summary, escrow notice, and mock pay CTA with a visible payment-window countdown. Dashboard gains `/dashboard/sessions` (role-aware upcoming/past lists). All copy via next-intl in 5 locales. Video attachment step appears only for `video_analysis` and lists the player's READY videos (link to upload flow if empty).

## Risks / Trade-offs

- [Two bookings race for one slot] → conditional `updateMany` claim in a transaction; loser gets 409 and a localized "slot just taken" message with refreshed slots.
- [Player pays exactly at expiry boundary] → `pay` endpoint re-checks `expiresAt` and slot state inside the payment transaction; a late pay gets 409 and the hold is never invoked (mock; real-vendor auth-then-void handled when a real provider lands).
- [In-process sweep missed (restart)] → inline expiry checks on read/pay; sweep also runs at startup, mirroring video-processing recovery.
- [Mock provider hides real-vendor constraints (webhooks, async holds)] → port is promise-based and payment has explicit `REQUIRES_HOLD` intermediate state so an async vendor maps onto it without schema change.
- [Catalog "next free slot" N+1] → single grouped min-`startsAt` query over listable slots for the page of coaches.
- [Enum values persisted before their flows exist (`IN_PROGRESS`…)] → only values used in this change are reachable; guards reject transitions not owned by this change.

## Migration Plan

1. Prisma migration: `SessionStatus`, `PaymentStatus` enums; `Session`, `Payment` tables (FKs to `User`, `ProProfile`, `ProService`, `AvailabilitySlot` unique, `Video` nullable).
2. Additive API modules (`catalog`, `bookings`, `payments`); one authorization change in `videos.service` (covered by regression tests).
3. Web routes are new pages; no changes to existing flows. Rollback = revert migration + modules; no data backfill needed.

## Open Questions

- None blocking. Payment-window length (15 min) and fee percent (10%) are config defaults the owner can tune.
