## Why

Session rooms embed self-hosted Jitsi as a plain iframe: a five-component Java stack (prosody, jicofo, jitsi-web, JVB, coturn) on an 8 GB single-node cluster, a third-party UI that ignores our design system and next-intl, no per-user authorization (the unguessable room slug is the only access control), and a trail of cross-browser workarounds (VP8-first, ssrcRewriting, p2p drops) whose production verification (deploy tasks 5.5/5.6) is still open. Nothing is in production yet — only a staging cluster — so this is the cheapest moment to switch the `VideoProvider` implementation to LiveKit: one Go binary SFU with server-minted per-participant JWTs, webhooks for server-side attendance evidence, and a React SDK that lets the call render natively inside the session-room page.

## What Changes

- **BREAKING (internal API):** `VideoProvider` becomes an authorization port — it mints a per-participant access token bound to the session room, user identity, and a short TTL — instead of returning a vendor iframe descriptor. The `RoomDescriptor` `embedded_jitsi` variant is replaced by a `livekit` variant (`url`, `roomName`); the join endpoint returns the access token alongside the attendance id. The `leave` endpoint and tab-close beacon are removed.
- **New `LiveKitVideoProvider`** in `apps/api` (livekit-server-sdk): token minting with grants scoped to the session room; participant identity = platform user id.
- **LiveKit webhook endpoint** in `apps/api` (`participant_joined` / `participant_left`), signature-verified, that stamps `connectedAt` / `leftAt` on the attendance entry created at join — attendance evidence now reflects an actual media connection, not just a page load.
- **Native call UI in `apps/web`** (`livekit-client` + `@livekit/components-react` hooks, styled with our Tailwind tokens, all strings via next-intl): device pre-check with local preview, two-tile call layout (local + counterpart), controls (mic, camera, screen share, leave), waiting-for-counterpart and reconnecting states, side-by-side with the attached video player for video-analysis sessions, stacked on narrow viewports.
- **Infra swap:** the Jitsi stack (compose services, Tilt resources, k8s manifests, coturn, custom-config.js, `jitsi-secrets`) is removed and replaced by a single `livekit-server` service in dev (docker-compose) and one Deployment in k3s; ingress host `meet.play-with.pro` is repurposed for LiveKit signaling (WebSocket) with TLS at Traefik; media via host UDP port range with ICE-over-TCP fallback and LiveKit's embedded TURN replacing coturn.
- **Env contract:** `JITSI_DOMAIN` is removed; `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` are added (dev defaults point at the compose service in dev-key mode).
- **Docs/roadmap:** `openspec/project.md` video-call decision updated; `design/DESIGN.md` provider note updated; `add-production-deploy` tasks 5.x/7.1 superseded by verification tasks in this change.
- Synced playback is **unchanged**: it keeps the platform socket.io channel; LiveKit's data channel is deliberately not used (decision recorded in design).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-rooms`: "Embedded video room via provider abstraction" becomes a token-authorized room via `VideoProvider` (LiveKit implementation; per-participant token, parties only, no vendor UI); "Attendance logging" gains connection evidence from provider webhooks and drops the client-side leave beacon; "Session room access" wording drops the Jitsi-specific descriptor.
- `dev-environment`: "One-command local environment" replaces the Jitsi compose stack with a single LiveKit service; "Environment configuration" replaces `JITSI_DOMAIN` with the LiveKit variables.

## Impact

- **API:** `apps/api/src/session-rooms/*` (provider, service, controller, module, new webhook controller), `config/env.validation.ts`, `main.ts` (raw body for webhook signature), Prisma migration adding `SessionAttendance.connectedAt`, e2e spec `test/session-rooms.e2e-spec.ts`, unit specs.
- **Shared:** `packages/shared/src/types/session-room.ts` (`RoomDescriptor`, `JoinRoomResponse`; `LeaveRoomRequest` removed).
- **Web:** `components/sessions/session-room.tsx`, `jitsi-room.tsx` → new `livekit-room.tsx` (+ small pre-join and controls components), message catalogs for 5 locales (new `sessions.room.call.*` keys).
- **Infra:** `infra/docker-compose.yml`, `infra/Tiltfile`, `infra/jitsi/` (deleted) → `infra/livekit/livekit.yaml`, `infra/k8s/jitsi/` (deleted) → `infra/k8s/livekit/`, `infra/k8s/app/ingress.yaml`, `infra/k8s/env.example`, `infra/k8s/README.md`, `infra/scripts/apply-secrets.sh`, `infra/scripts/deploy.sh`; host firewall rules (UDP range + TCP 7881 replace 10000/udp; 3478/5349 for TURN).
- **Dependencies:** add `livekit-server-sdk` (api), `livekit-client` + `@livekit/components-react` (web); no Jitsi packages were ever installed (plain iframe), so nothing to remove.
- **Disputes/admin:** attendance entries gain `connectedAt`; the admin dispute view shows it as connection evidence (read-only addition).
