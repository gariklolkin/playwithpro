# Tasks: add-synced-playback

## 1. Shared types & API foundation

- [x] 1.1 Add playback sync types to `packages/shared` (state snapshot `{ playing, positionSeconds, emittedAtMs }`, client→server and server→client event names/payloads, socket namespace constant)
- [x] 1.2 Add `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` to `apps/api`; wire the socket.io adapter in `main.ts` with CORS mirroring the existing REST CORS config (origin allowlist + credentials)
- [x] 1.3 Extract/reuse a party+status+join-window authorization check from `SessionRoomsService` callable by the gateway (no behavior change to existing room endpoints)

## 2. Playback sync gateway

- [x] 2.1 Implement `PlaybackSyncGateway` in the `session-rooms` module on the `/playback-sync` namespace: handshake validates JWT from the auth cookie, resolves the session id, enforces party/status/window checks and `video_analysis` service type; failures disconnect
- [x] 2.2 On successful handshake join socket room `session:<id>`; relay full-state messages to the other party, server-stamp them, and store last state in an in-memory map; replay last state to a newly connected socket; drop map entry when the room empties
- [x] 2.3 Unit tests for the gateway: third-party rejected, outside-window rejected, non-video-analysis rejected, relay + last-writer-wins stamping, catch-up replay on join

## 3. Web client

- [x] 3.1 Add `socket.io-client` to `apps/web`; implement a `useSyncedPlayback` hook (connect with credentials to the API origin, expose shared-state application to a `<video>` ref, emit local gestures as full-state snapshots, elapsed-time compensation, reconnect handling)
- [x] 3.2 Wire the hook into `room-video-panel.tsx` for video-analysis rooms: apply remote play/pause/seek, emit on local user gestures, heartbeat re-emit while this client was the last commander, drift snap beyond the 2s threshold
- [x] 3.3 Sync toggle UI on the video panel (default on; off = ignore remote + emit nothing; on = request current state and snap) and a sync status indication
- [x] 3.4 Autoplay-block handling: when programmatic `play()` rejects, show the localized resume-sync overlay; activation re-applies the shared state
- [x] 3.5 Component tests for the panel/hook: remote state applied, local gesture emitted, toggle detach/re-attach, autoplay-block overlay path

## 4. i18n & docs

- [x] 4.1 Add `sessions.room.sync.*` strings (toggle, status, resume prompt) to all five locale catalogs (en/fr/de/ru/zh)
- [x] 4.2 Correct the stale "Jitsi data channel is the future path for synced playback" note in `openspec/project.md` to reflect the platform WebSocket decision (design D1)

## 5. Verification

- [x] 5.1 API e2e: socket handshake auth against a seeded video-analysis session (party admitted inside window, third party and out-of-window rejected)
- [x] 5.2 Browser smoke against Tilt: two browser sessions (coach + player) in one video-analysis room — play/pause/seek propagate both ways, late join catches up, toggle detaches/re-attaches, drift snap observed
- [x] 5.3 Full gate: lint, typecheck, unit/component/e2e suites green across the monorepo
