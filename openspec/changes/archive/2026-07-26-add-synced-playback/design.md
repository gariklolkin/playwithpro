# Design: add-synced-playback

## Context

Video-analysis session rooms (change 8) show the attached video player side by side with the embedded Jitsi call, but each party's `<video>` element is fully independent — coordination happens by voice. This change makes playback state shared between the two parties.

Current implementation facts that constrain the design:

- The Jitsi embed is a **plain iframe** (`apps/web/components/sessions/jitsi-room.tsx`) — change 8 deliberately skipped `external_api.js` because it hardcodes `https://` (breaking the cert-free plain-HTTP local Jitsi at `http://localhost:8000`) and executes third-party script in our page. Without `external_api.js` there is no access to Jitsi's data channel from the page.
- Room access control already exists server-side: `SessionRoomsService.getRoom` enforces parties-only, room-eligible statuses (`paid_escrow` / `in_progress` / `awaiting_confirmation`), and the join window (lead before `startsAt`, grace after `endsAt`).
- Auth is JWT in cookies (`JwtAuthGuard`); the browser sends cookies on the WebSocket handshake to the API origin, so the existing token can authenticate socket connections.
- The API has no WebSocket usage yet; the API runs as a single instance.
- Playback URLs are short-lived pre-signed S3 URLs fetched per client — each party streams the video independently; only *state* needs syncing.

## Goals / Non-Goals

**Goals:**
- Play / pause / seek by either party reflected on the other party's player in near-real time.
- Late-join/reconnect catch-up, bounded drift while playing.
- Per-user detach ("browse privately") and re-attach.
- Party-only, join-window-scoped access to the sync channel; no new attack surface on room slugs or playback URLs.
- Graceful handling of browser autoplay restrictions.

**Non-Goals:**
- Annotation/telestration, playback-rate sync, mid-session video switching, playlists.
- Persistence of playback state across room lifetimes; multi-instance API scale-out (noted as follow-up).
- Any change to Jitsi embedding, attendance, or session lifecycle.
- Frame-accurate lockstep — sub-second agreement is enough for "look at this moment" coaching.

## Decisions

### D1. Transport: platform WebSocket gateway, not the Jitsi data channel

A socket.io gateway on the API (`@nestjs/websockets` + `@nestjs/platform-socket.io`) relays playback state between the two parties of a session.

- *Why not Jitsi data channel* (the "future path" once noted in `project.md`): it requires `external_api.js`, which change 8 rejected for good reasons (https-only, third-party script). Reversing that decision would break the plain-HTTP dev stack and re-introduce vendor script execution.
- *Why not vendor-bound anyway*: project convention forbids binding business logic to providers; a platform channel works unchanged if `VideoProvider` ever switches.
- *Why socket.io over raw `ws`*: first-class NestJS platform adapter, built-in reconnection with backoff, rooms primitive for per-session isolation, and a documented Redis adapter as the later scale-out path.
- `project.md` gets a one-line correction as part of this change.

### D2. Handshake auth and channel scoping

The client connects to a `/playback-sync` namespace with `withCredentials: true` and the session id; the gateway validates the JWT from the cookie (reusing the auth module's token verification) and then calls the same party/status/join-window logic `SessionRoomsService` already uses. Success joins the socket to room `session:<id>`; failure disconnects. Only `video_analysis` sessions accept connections (other types have no video panel).

- *Why join-window-scoped*: mirrors the room descriptor contract — the sync channel must not become a side door for observing a session outside its window.
- *Why not an ephemeral signed ticket from a REST endpoint*: cookies already reach the API origin on handshake; a ticket adds a round trip and state for no security gain here.

### D3. Sync model: shared control, last-writer-wins full-state messages

No leader election. Any party's local user gesture (play / pause / seek) emits a full state snapshot: `{ playing, positionSeconds, emittedAtMs }`. The gateway stamps it, stores it as the room's last state (in-memory map), and relays it to the other party. Receivers apply it: seek to `positionSeconds` (+ elapsed-time compensation when `playing`), then play or pause. While playing, the party that last issued a command re-emits a heartbeat snapshot every few seconds; a receiver whose position deviates more than the drift threshold (default 2 s) snaps to the shared position.

- *Why full state, not deltas*: with two participants, last-writer-wins on a complete snapshot is trivially convergent and makes join/reconnect catch-up the same code path (server replays last state on join).
- *Why no leader role*: a coach naturally leads, but hard-locking control adds UI and edge cases (leader disconnects) for no MVP value; simultaneous commands are rare with two people talking to each other and resolve to the later writer.
- *Why heartbeat from last commander*: keeps the authority implicit and cheap; if that party disconnects, the state simply stops advancing — acceptable, the other party clicks play.

### D4. Per-user sync toggle

Sync is on by default for both parties. Turning it off makes the client ignore incoming states and emit nothing (private scrubbing); turning it back on requests the current shared state from the server and snaps to it. The toggle is client-local — the other party's experience is unaffected.

### D5. Ephemeral state, no schema changes

Room state lives in a gateway-held `Map<sessionId, state>`, dropped when the last socket leaves or on window close. No Prisma migration, nothing to archive or audit — playback position is not evidence (attendance already covers that).

- *Single-instance assumption*: matches the current deployment; scale-out later = socket.io Redis adapter + moving the map to Redis. Documented, not built.

### D6. Autoplay-block handling

Browsers may reject programmatic `video.play()` before a user gesture on the page. If applying a remote state rejects, the panel shows a localized "resume sync" overlay; clicking it (a gesture) re-applies the shared state. No muted-autoplay workaround — muting an analysis video is acceptable but confusing, and a single click is cheaper.

## Risks / Trade-offs

- [Simultaneous commands race (both click within RTT)] → last-writer-wins by server stamp order; parties are on a live call and self-correct. No conflict UI.
- [Clock skew between clients] → elapsed-time compensation uses only server receive-time deltas and local monotonic time, never cross-client wall clocks.
- [socket.io CORS/credentials misconfig] → gateway CORS mirrors the existing REST CORS config (same origin allowlist, credentials on); covered by an e2e handshake test.
- [WS blocked by proxy/network for one party] → sync degrades to the status quo (independent players + voice); the room itself is unaffected. No polling fallback in MVP.
- [Heartbeat authority disconnects while playing] → state stops advancing; either party's next gesture re-establishes authority. Accepted.
- [Tilt live_update does not sync `apps/web/components/` and `messages/`] → expect full web-image rebuilds during UI work (known quirk).

## Migration Plan

Additive only: new API deps + gateway, new client hook/UI, new i18n keys, `project.md` note fix. No DB migration, no config-breaking changes (new optional envs only if a drift threshold override is exposed). Rollback = revert; rooms keep working with independent players.

## Open Questions

None blocking. Deferred explicitly: multi-instance fan-out (Redis adapter), playback-rate sync, annotations.
