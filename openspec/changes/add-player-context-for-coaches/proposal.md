## Why

Players fill in a profile (level, style, experience, handedness, grip, "about / goals") that no coach ever sees: the `PlayerCard` component built in change 12 is rendered nowhere, so a coach meets each player knowing only a display name and an avatar and spends the first paid minutes on discovery questions. Video analysis depends on handedness, grip and level to judge technique, and mismatched expectations turn into disputes. Meanwhile `GET /players/:id` lets any professional read any player's profile whether or not they share a session — a privacy gap to close before launch (GitHub issue [#1](https://github.com/gariklolkin/playwithpro/issues/1)).

## What Changes

- **Player card travels with the session, for the coach only.** A coach sees the player's card through a shared session from `paid_escrow` onward (`paid_escrow`, `in_progress`, `awaiting_confirmation`, `completed_paid`, `disputed`, `resolved`), never for unpaid or cancelled sessions. The card is embedded in the session data (list, detail, room), so no separate lookup is needed.
- **`GET /players/:id` becomes admin-only.** **BREAKING** for the professional role: coaches lose the ad-hoc endpoint; the session-embedded card replaces it.
- **Optional session goal.** "What should we focus on?" — up to 500 characters, for all three services. The player sets it in the booking panel, sees it in the checkout summary, and can edit it until the session starts (same rule as the clip set). The coach sees it under the same access rule as the card.
- **Coach surfaces.** A collapsed "About the player" disclosure (card + goal) on the coach's bookings-list entry and next to the session-room header ("Session with {name}") in both video-analysis and consultation rooms.
- **Player transparency.** A hint on the profile page and under the goal field ("Coaches you book can see this after payment") and a "How coaches see you" preview card rendering the player's own card exactly as a coach will see it.
- **Never-filled state.** A player who never saved their profile is shown as "hasn't filled in a profile yet" instead of the default `beginner` level.
- Localized strings in all five catalogs.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `player-profiles`: "Read access for coaches and admins" narrows to admins plus session-scoped coach access; new requirements for the player-side visibility hint/preview and the unfilled-profile state.
- `booking`: new "Session goal" requirement (optional, ≤ 500 chars, editable by the player until start, shown in checkout); "Session lists for both parties" gains the coach-side "About the player" disclosure under the paid-session rule.
- `session-rooms`: new "Player context in the session room" requirement (card + goal disclosure in the room header for the coach, same access rule).

## Impact

- **Database:** `Session.goal` (nullable, 500 chars) — additive Prisma migration. No profile schema change; "filled" is derived from the profile having been saved after creation.
- **Shared:** `SessionResponse.goal`, `SessionResponse.playerContext: PlayerCardResponse | null` (coach viewer only), `SessionRoomResponse.goal` + `playerContext`, `PlayerCardResponse.filled: boolean`, `CreateBookingRequest.goal?`, new `UpdateSessionGoalRequest`.
- **API:** `bookings.service.ts` / `session.mapper.ts` (viewer-dependent `playerContext`, goal), `CreateBookingDto.goal`, new `PATCH /sessions/:id/goal` (player only, until start), `session-rooms.service.ts#getRoom`, `players.controller.ts` (`GET /players/:id` → admin), `players.service.ts` (`filled`). Unit specs + `booking.e2e-spec.ts` / `session-rooms.e2e-spec.ts`.
- **Web:** `booking-panel.tsx` (goal field + summary), `checkout-panel.tsx` (goal in summary), `sessions-list.tsx` (player: inline goal edit until start; coach: "About the player" disclosure), `session-room.tsx` (header disclosure; coordinates with change 19's time indicator on the header's right side), `player-card.tsx` (unfilled state, goal slot), `player-profile-editor.tsx` (hint + preview). New keys under `playerProfile.visibility`, `playerProfile.card`, `booking.goal`, `sessions.goal`, `sessions.aboutPlayer` ×5.
- **Non-goals (explicit):** coaches accepting/declining bookings, player-controlled visibility settings, coach private notes, goal templates or tags, admin session views (admins keep `GET /players/:id`).
