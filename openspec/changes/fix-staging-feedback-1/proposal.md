## Why

The first two-person test on staging (2026-09-10, owner as coach, a real player as counterpart) surfaced three defects that block a credible trial: a false "camera or microphone unavailable" notice during a working call, an abandoned checkout that makes the booked slot silently vanish for the player with no way back, and broken avatars everywhere because the production bucket is private while avatars are served as public object URLs.

## What Changes

- **Device notice reflects reality.** The in-call "unavailable" notice is derived from the local participant's actual published tracks against what the party asked for on pre-join, instead of a sticky flag set by any device error (including a cancelled screen-share picker or a transient busy device on join). It clears as soon as the requested camera/microphone publishes and names the device that is actually missing.
- **Unpaid bookings are visible and releasable.** The coach page shows the player's own unpaid booking with this coach (time, minutes left) with "Pay" and "Release slot"; the checkout page gets the same "Release slot" action. A player can cancel their own `pending_payment` session, which reopens the slot immediately (no money moved). The expiry sweep runs every minute instead of every five.
- **A released slot can be booked again.** `Session.slotId` was unique, so a cancelled or expired session kept its slot claimed forever and the next booking of a reopened slot failed with a server error. The constraint becomes a plain index; the atomic `open → booked` slot claim already guarantees one live booking per slot.
- **Avatars are delivered through the API.** Avatar URLs point at `GET /avatars/<key>` on the API, which validates the key shape and redirects to a short-lived pre-signed storage URL. No bucket content needs to be public; the dev MinIO bootstrap stops making the whole bucket anonymously readable.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-rooms`: new requirement "Device failure notice" (derived, self-clearing).
- `booking`: new requirement "Unpaid booking visibility and release" (banner, player cancellation of `pending_payment`, one-minute sweep).
- `user-accounts`: "Account avatar" — delivery via an API redirect to a pre-signed URL instead of a public object URL.

## Impact

- **API:** Prisma migration `session_slot_not_unique` (drop the unique index on `Session.slotId`, keep an index; `AvailabilitySlot.sessions[]`), `bookings.service.ts` (`cancel` accepts `PENDING_PAYMENT` for the player), `booking-expiry.service.ts` (cron every minute), new `users/avatars.controller.ts`, `storage.service.ts` (`objectUrl` → `avatarUrl` built from `API_URL`); unit specs and `booking.e2e-spec.ts`.
- **Web:** `livekit-room.tsx` (derived notice), `booking-panel.tsx` (pending banner), `checkout-panel.tsx` (release), five catalogs.
- **Infra:** `infra/docker-compose.yml` MinIO bootstrap no longer sets anonymous download. One additive migration (index change only), no new env (uses existing `API_URL`).
