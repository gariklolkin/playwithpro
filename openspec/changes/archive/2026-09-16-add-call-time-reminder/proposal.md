## Why

Nothing in the session room tells either party how much of the paid slot is left: the header shows the start time, and the session silently moves to `awaiting_confirmation` when `endsAt` passes (change 8). Coaches run over or cut short without noticing, players cannot tell whether a late start eats into their hour, and the next slot's countdown starts while the previous call is still going. Owner request (2026-09-15): add a call-time reminder in the call.

## What Changes

- **Remaining-time indicator in the room header.** While the join window is open, the header shows a live, tabular countdown derived from the session's `endsAt`: "starts in m:ss" before `startsAt`, "m:ss left" during the slot, and "+m:ss over" after `endsAt` until the window closes. It stays visible in the theatre, rail and focus layouts and for both service types that use the room.
- **Two non-blocking reminders during the call.** When a party is in the call, a toast appears 10 minutes before `endsAt` ("10 minutes left") and at `endsAt` ("Time is up — the session has ended; you can keep talking until the room closes at hh:mm"). Toasts auto-dismiss, are dismissible, are announced politely to screen readers, and never block controls. The call is **not** cut off; session progression stays clock-driven exactly as in change 8.
- **Server-derived clock.** The room response carries the server's current time so the countdown and the reminders are computed from a server-time offset, not from the client clock. A device whose clock is minutes off sees the same remaining time as the other party.
- **Fixed thresholds.** The reminder lead time is a shared constant (10 minutes). No per-user setting in the MVP.
- **Fullscreen-safe.** When the video-analysis clip card is fullscreen, reminders render inside the fullscreen element so they are not hidden behind it.
- Localized indicator and toast strings in all five catalogs.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-rooms`: adds the "Call-time indicator and reminders" requirement (server-time-derived remaining time in the header, T-10 and T-0 toasts during the call, no cut-off) and extends "Localized session room" to cover the new strings.

## Impact

- **Shared:** `SessionRoomResponse.serverNow: string` (ISO); `CALL_TIME_REMINDER_BEFORE_END_MIN = 10` in `packages/shared/src/types/session-room.ts`.
- **API:** `session-rooms.service.ts#getRoom` sets `serverNow` from the same `now` it uses for the join-window check. No DB change, no new endpoint. Unit spec + `test/session-rooms.e2e-spec.ts` assert the field.
- **Web:** new `lib/use-session-clock.ts` (server offset, 1 s tick, threshold crossings), new `components/sessions/room-toast.tsx` (portal, auto-dismiss, `aria-live="polite"`), header indicator in `session-room.tsx`; new `sessions.room.time.*` keys ×5. Unit tests with fake timers for the hook and the toast sequence.
- **Not affected:** session status transitions, settlement, attendance, LiveKit connection lifecycle (the indicator lives outside `LiveKitRoom`, so no remount).
- **Coordination:** change 23 (`add-player-context-for-coaches`) adds an "About the player" disclosure to the same header; whichever lands second slots into the header's existing left/right layout without moving the indicator.
