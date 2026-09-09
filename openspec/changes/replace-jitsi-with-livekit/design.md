## Context

Session rooms (change 8) embed a self-hosted Jitsi conference as a plain iframe: `JitsiVideoProvider.getRoom()` returns `{ kind: 'embedded_jitsi', domain, roomName }`, the web page renders `<iframe src="https://meet…/playwithpro-<slug>">`, and attendance is logged by our own `POST /sessions/:id/room/join` on page open plus a best-effort `leave` beacon on tab close. Synced playback (change 12) rides a platform socket.io channel because the iframe exposes no data path.

Current state of the stack: dev runs five Jitsi containers under Tilt with a coturn relay to work around Rancher Desktop dropping UDP port mappings; the staging k3s cluster (`add-production-deploy`, in progress) has manifests for prosody/jicofo/jitsi-web/JVB/coturn with explicit Java heap caps on an 8 GB node. Cross-browser verification on the real origin (tasks 5.5, 5.6) has not been done. No production users exist.

Constraints carried over: single API instance (in-memory playback-sync state), single node, no paid registry, secrets only via `apply-secrets.sh`, `VideoProvider` stays a port (business logic must not bind to LiveKit), five locales, no hard-coded strings.

## Goals / Non-Goals

**Goals:**
- Replace the Jitsi iframe with a native call UI in the session-room page, rendered from our design system and next-intl.
- Per-participant, server-minted, short-lived room authorization bound to the platform user (identity) and the session room; the room slug stops being a capability.
- Attendance evidence that reflects a real media connection (provider webhooks), without depending on client beacons.
- One media server process in dev (compose) and prod (k3s), with a working media path on the dev machine (no UDP) and on the public host (UDP first, TCP/TURN fallback) — replacing coturn.
- Keep the `VideoProvider` port meaningful: a different SFU or a hosted LiveKit (Cloud) is a config/implementation swap, not a business-logic change.

**Non-Goals:**
- Session recording / LiveKit Egress (future dispute evidence; separate change).
- Moving synced playback onto LiveKit's data channel (see decision 8).
- Group calls, waiting rooms, chat, reactions, admin live oversight of calls.
- Google Meet for pro–amateur sessions (unchanged: Meet stays only for admin verification calls).
- Horizontal scaling of the media server (Redis-backed multi-node LiveKit).

## Decisions

1. **LiveKit self-hosted (`livekit/livekit-server`) as the `VideoProvider` implementation.** One Go binary, SFU with simulcast/dynacast/adaptive-stream defaults, embedded TURN, JWT access tokens, webhooks, official Node server SDK and React client SDK. *Alternatives rejected:* keep Jitsi + prosody JWT auth (fixes authorization only; keeps the iframe, five containers, and the codec/p2p flag trail); mediasoup/raw WebRTC (no token/webhook/UI SDK — we would build an SFU product, not a marketplace); Daily/Twilio-style hosted APIs (vendor lock-in; LiveKit Cloud remains available with the same SDK if self-hosting becomes a burden).

2. **`VideoProvider` becomes an authorization port.** New shape:
   ```ts
   interface VideoProvider {
     describeRoom(input: { roomSlug: string }): RoomDescriptor;          // { kind: 'livekit', url, roomName }
     issueToken(input: { roomSlug: string; participant: { id: string; displayName: string; role: 'player' | 'coach' } }): Promise<string>;
   }
   ```
   `describeRoom` is sync and cheap (still returned from `GET /sessions/:id/room` inside the join window so the page can prepare the pre-join UI); `issueToken` is called by `POST /sessions/:id/room/join` and its result rides in `JoinRoomResponse.token`. The room name is the session's `roomSlug` verbatim (unique in `Session`, so webhooks map `room.name → session` with one indexed lookup). Token: identity = platform user id, name = display name, metadata = `{"role":…}`, grants `roomJoin`, `room = slug`, `canPublish`, `canSubscribe`, `canPublishData = false`, `roomCreate = false`, TTL 10 minutes (only the initial connect validates it; LiveKit issues its own resume tokens afterwards). *Alternative rejected:* returning the token from `GET` — that endpoint is polled by the countdown and a token is a capability that should be minted on an explicit join.

3. **Join is an explicit user action, not a page load.** The room page shows a pre-join panel (camera/mic preview, device pickers, mute toggles) and a "Join call" button; the click calls `POST …/join`, creates the attendance row, and connects. The gesture also satisfies browser autoplay policy for remote audio. Leaving disconnects and offers "Rejoin" (a new join → new token, new attendance row — matches "rejoin logged separately"). Multi-tab: LiveKit drops the older connection with the same identity; acceptable and documented.

4. **Attendance evidence: join row + webhook stamps.** `SessionAttendance` gains nullable `connectedAt`. `POST /livekit/webhook` (signature verified with `WebhookReceiver` from `livekit-server-sdk`; Nest bootstrapped with `rawBody: true`) handles:
   - `participant_joined` → latest row for `(session, userId)` with `connectedAt IS NULL AND leftAt IS NULL` gets `connectedAt = event time`; if none exists (LiveKit full-reconnect emits left+joined with the same token) a new row `{ joinedAt, connectedAt }` is created.
   - `participant_left` → latest row with `leftAt IS NULL` gets `leftAt = event time`.
   Updates are conditional on null fields, so webhook retries are idempotent. Unknown room names or identities are logged and ignored (never 5xx — LiveKit would retry). The `leave` endpoint, `LeaveRoomRequest`, and the `pagehide` beacon are removed. The disputes view shows `connectedAt` beside `joinedAt` ("joined page / connected to call"). *Alternative rejected:* webhooks as the only source — a lost webhook would erase evidence that the party at least tried to join.

5. **Admin gets timing, not a token.** `GET …/room` keeps admitting admins (needed for the room-window smoke flow); `POST …/join` is parties-only and yields not-found for anyone else, matching the spec's "exactly the two parties". LiveKit `room.max_participants: 2` is a second fence.

6. **Web: `@livekit/components-react` hooks + `livekit-client`, our own markup.** `LiveKitRoom` (with `connect`, `token`, `serverUrl`, `RoomAudioRenderer`), `useTracks`/`VideoTrack` for tiles, `useLocalParticipant` for mic/cam/screen-share toggles, `useConnectionState` for reconnecting/disconnected overlays, `usePreviewTracks` + `useMediaDeviceSelect` for the pre-join panel. `@livekit/components-styles` is **not** imported; classes are Tailwind tokens from `design/DESIGN.md`. Layout: counterpart (or active screen share) as the main tile, local video as a corner PiP, controls bar below; "Waiting for {name}" placeholder until the counterpart publishes; side-by-side with `RoomVideoPanel` for video-analysis at ≥900px, stacked below. All strings under `sessions.room.call.*` in five catalogs. *Alternative rejected:* the prebuilt `VideoConference` component — its look is not ours and its strings bypass next-intl.

7. **Media network layout.**
   - **Prod (k3s):** one Deployment with `hostNetwork: true` + `dnsPolicy: ClusterFirstWithHostNet` (so the webhook can reach `http://api:4000`). Signaling on 7880 behind the existing Traefik ingress host `meet.play-with.pro` (TLS terminated at Traefik, WebSocket passes). Media: `rtc.udp_port: 7882` (single muxed UDP port — one firewall rule instead of a 10 000-port range), `rtc.tcp_port: 7881` (ICE over TCP, first fallback), `rtc.node_ip: 152.53.186.65`. Embedded TURN replaces coturn: `turn.udp_port: 3478`, `turn.tls_port: 5349`, cert mounted from the cert-manager Secret of the `meet.play-with.pro` ingress (LiveKit reads certs at start → the deploy runbook restarts the pod after renewals; cert-manager renews 30 days ahead so a monthly deploy covers it). ufw: replace `10000/udp` with `7881/tcp`, `7882/udp`, keep `3478`, add `5349/tcp`. Resources: request 256 Mi / 250m, limit 1 Gi — ~1.5 GB freed versus the Jitsi set.
   - **Dev (compose/Tilt):** one `livekit-server` service, config file `infra/livekit/livekit.yaml` (dev keys `devkey: secret`, `node_ip: 127.0.0.1`, `use_external_ip: false`, TURN off), published ports 7880 and 7881 tcp only. Rancher Desktop drops UDP, so ICE-over-TCP on 7881 is the working path — the same fallback we ship to prod, exercised on every dev call. Browsers connect to `ws://localhost:7880`; the api reaches `http://livekit:7880` for nothing (token minting is offline) and LiveKit reaches `http://api:4000` for webhooks.
   *Alternative rejected:* `hostPort` per port (the UDP range made this impractical; with the mux port it would work, but hostNetwork is simpler and there is one media pod per node by construction).

8. **Synced playback stays on socket.io.** The channel is already specified, tested, and independent of the call (works before either party joins the call, and with sync toggled per user). Using LiveKit's data channel would couple playback to call membership and force `canPublishData`. Revisit only if a second API instance ever forces a Redis adapter anyway.

9. **Config & secrets.** API env: `LIVEKIT_URL` (public WebSocket URL handed to browsers), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; `JITSI_DOMAIN` deleted from `env.validation.ts`, compose, `env.example`. Prod LiveKit config is a template `infra/k8s/livekit/livekit.yaml.tpl` rendered by `apply-secrets.sh` with `envsubst` from `~/.playwithpro-prod.env` into Secret `livekit-config` (the key/secret pair must match the api's; one source file guarantees that). `jitsi-secrets` generation is removed. Image pinned to an explicit `livekit/livekit-server:v1.x.y` tag in both compose and k8s.

10. **Deploy-change hand-off.** `add-production-deploy` tasks 5.1–5.6 and 7.1 are marked superseded by this change (note in its `tasks.md`); the browser matrix and fallback-path verification move here (tasks 7.x) and run against LiveKit.

## Risks / Trade-offs

- [ICE over TCP is the only dev media path] → identical to today's coturn/TCP situation; prod verification of the UDP path is an explicit task (7.2).
- [TURN/TLS cert rotation needs a pod restart] → documented in `infra/k8s/README.md`; `deploy.sh` restarts the livekit Deployment when its config Secret hash changes; ICE/TCP on 7881 keeps calls working even if TURN is stale.
- [Webhook delivery is at-least-once and unordered] → conditional null-field updates make handlers idempotent; joinedAt from the join row is never dependent on a webhook.
- [Custom call UI has more surface than an iframe (device permissions, Safari quirks, screen share on mobile)] → pre-join preview surfaces permission errors before connecting; screen share hidden where `getDisplayMedia` is unavailable; manual matrix task covers Chrome/Firefox/Safari desktop + iOS Safari/Android Chrome.
- [`hostNetwork` pod shares host ports] → the port set (7880–7882, 3478, 5349) is reserved in the README; k3s/Traefik use 80/443/6443 only.
- [Single-node media server on the app box] → a 1:1 call is ~2–4 Mbps and negligible CPU on an SFU; the resource audit (7.4) records headroom; LiveKit Cloud is the escape hatch with no code change.
- [Client bundle grows (~250 KB gz for livekit-client)] → loaded only on the room page via dynamic import.

## Migration Plan

Fresh replacement, no user data: (1) land api + shared + web + infra in one PR; (2) `apply-secrets.sh` (new LiveKit vars, renders `livekit-config`); (3) `deploy.sh` applies `k8s/livekit/`, ingress update, and app images; (4) `kubectl delete -f infra/k8s/jitsi/` is run once by hand before the directory is removed from the repo, plus `kubectl delete secret jitsi-secrets`; (5) ufw rule swap on the host; (6) smoke: seed session → room-window open → two browsers pre-join → call + synced player → webhook-stamped attendance visible in the admin dispute view. Rollback: `git revert` (Jitsi manifests return from history) + `rollout undo`; the added nullable column is harmless to leave.

## Open Questions

- Versions pinned at implementation (2026-09-09): `livekit/livekit-server:v1.13.6`, `livekit-server-sdk@2.19.0`, `livekit-client@2.22.3`, `@livekit/components-react@2.9.24`.
- Whether to expose a "camera off by default" preference for coaches on video-analysis sessions (UX nicety; not blocking).
