# Proposal: add-synced-playback

## Why

In a video-analysis session the whole point is that coach and player look at the same moment of the footage, but today each side has a fully independent `<video>` player in the session room — "go to 2:14, no, back two seconds" is coordinated by voice over the call. Shared playback control was explicitly spun off from `add-session-rooms-calendar` as the v2 follow-up (`add-synced-playback` in the roadmap); with rooms, confirmation, and the admin console done, this is the next piece of core session value.

## What Changes

- Playback state of the attached video in **video-analysis session rooms** becomes shared between the two parties: play, pause, and seek by either party are reflected on the other party's player in near-real time.
- A **platform-owned realtime sync channel** (WebSocket gateway on the API, scoped to the session room, parties only, join-window only) carries playback state. Note: this deviates from the earlier "Jitsi data channel" idea recorded in `project.md` — the change-8 embed is a plain iframe without `external_api.js`, so no data channel is available; see design.md D1.
- Late join / reconnect **catch-up**: a party that connects while a shared state exists conforms to it immediately; **drift correction** keeps followers within a bounded offset while playing.
- A per-user **sync toggle** lets a party temporarily detach (scrub privately), then re-attach and snap back to the shared state.
- Browser **autoplay-block handling**: when the browser refuses programmatic playback, the user is prompted to resume sync instead of silently drifting.
- No persistence and no schema changes: shared state is ephemeral, held in memory for the lifetime of the room.
- Consultation and game sessions are untouched (they have no video panel).

Out of scope: annotation/drawing over video, playback-rate sync, switching the attached video mid-session, multi-video playlists, Jitsi hardening.

## Capabilities

### New Capabilities

- `synced-playback`: shared playback state for the attached video in video-analysis session rooms — the realtime sync channel (party-only, window-scoped), command propagation between the two parties, catch-up on join/reconnect, drift correction, per-user sync opt-out, and localized sync UI.

### Modified Capabilities

<!-- none — session-rooms requirements are unchanged; synced playback is additive on top of the existing side-by-side video panel -->

## Impact

- **API (`apps/api`)**: new WebSocket gateway in the `session-rooms` module (new deps: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`); handshake auth reuses the JWT cookie + existing party/join-window checks in `SessionRoomsService`. No Prisma migration.
- **Web (`apps/web`)**: `room-video-panel.tsx` gains a synced-playback hook (socket.io client), sync toggle UI, drift correction, and autoplay-block prompt; only rendered for video-analysis rooms as today.
- **Shared (`packages/shared`)**: playback sync event/state types.
- **i18n**: new `sessions.room.sync.*` strings in all five catalogs.
- **Docs**: correct the stale "Jitsi data channel is the future path for synced playback" note in `openspec/project.md`.
- **Ops**: single-API-instance assumption for the in-memory room state (matches current deployment; a socket.io Redis adapter is the scale-out path later).
