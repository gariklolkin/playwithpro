## 1. Dependencies & shared contract

- [x] 1.1 Add `livekit-server-sdk` to `apps/api`; pin `livekit/livekit-server` image tag (record versions in design.md Open Questions)
- [x] 1.2 Add `livekit-client` + `@livekit/components-react` to `apps/web` (no `@livekit/components-styles`)
- [x] 1.3 `packages/shared`: replace `RoomDescriptor.embedded_jitsi` with `{ kind: 'livekit'; url: string; roomName: string }`; add `token: string` to `JoinRoomResponse`; remove `LeaveRoomRequest`; add `connectedAt: string | null` to `DisputeAttendanceEntry`

## 2. API — provider, tokens, join

- [x] 2.1 Env: remove `JITSI_DOMAIN`; add `LIVEKIT_URL` (default `ws://localhost:7880`), `LIVEKIT_API_KEY` (default `devkey`), `LIVEKIT_API_SECRET` (default `secret`) with validation; update `infra/docker-compose.yml` api env and `.env.example`
- [x] 2.2 Reshape `VideoProvider` port: `describeRoom()` + `issueToken()` per design decision 2; delete `jitsi-video.provider.ts` + spec
- [x] 2.3 Implement `LiveKitVideoProvider` (identity = user id, name, role metadata, grants roomJoin/canPublish/canSubscribe only, `canPublishData=false`, `roomCreate=false`, TTL 10 min) with unit spec decoding the JWT claims
- [x] 2.4 `SessionRoomsService.getRoom` returns the `livekit` descriptor inside the window; `join` becomes parties-only (admin → not-found), creates the attendance row, and returns `{ attendanceId, token }`
- [x] 2.5 Remove `leave` endpoint, `LeaveRoomDto`, and `SessionRoomsService.leave`
- [x] 2.6 Wire `LiveKitVideoProvider` in `SessionRoomsModule`; update `fake-meeting.provider.ts` comment that references Jitsi

## 3. API — attendance evidence via webhooks

- [x] 3.1 Prisma migration: `SessionAttendance.connectedAt DateTime?`
- [x] 3.2 Bootstrap Nest with `rawBody: true`; add `POST /livekit/webhook` (unauthenticated route, verified with `WebhookReceiver` against `LIVEKIT_API_KEY/SECRET`; invalid signature → 401)
- [x] 3.3 Handle `participant_joined` / `participant_left` per design decision 4 (room name → session by `roomSlug`, identity → user id, conditional null-field updates, create-on-missing for joined, ignore unknown, never 5xx); unit spec covering stamp, duplicate delivery, missing row, unknown room
- [x] 3.4 Disputes: include `connectedAt` in `disputes.service.ts` attendance select/mapping
- [x] 3.5 e2e `session-rooms.e2e-spec.ts`: descriptor kind `livekit`, join returns a token with identity/room claims, admin join → 404, `leave` gone, signed webhook stamps `connectedAt`/`leftAt`, unsigned webhook → 401

## 4. Web — native call UI

- [x] 4.1 Delete `jitsi-room.tsx`; add `livekit-room.tsx` (dynamic import on the room page) wrapping `LiveKitRoom` + `RoomAudioRenderer`, connecting with `url` + `token`
- [x] 4.2 Pre-join panel: local preview (`usePreviewTracks`), camera/mic device selects (`useMediaDeviceSelect`), mute toggles, permission-error state, "Join call" button that triggers `POST …/join` and connects
- [x] 4.3 In-call layout: main tile (counterpart camera or active screen share), local PiP tile, "Waiting for {name}" placeholder, reconnecting/disconnected overlay via `useConnectionState`
- [x] 4.4 Controls bar: mic, camera, screen share (hidden when `getDisplayMedia` unavailable), leave → disconnected state with "Rejoin" (new join)
- [x] 4.5 `session-room.tsx`: remove page-open join + `pagehide` beacon; keep countdown/closed states; side-by-side grid with `RoomVideoPanel` at ≥900px, stacked below; playback-sync untouched
- [x] 4.6 i18n: add `sessions.room.call.*` keys (pre-join, controls, waiting, reconnecting, left/rejoin, permission errors) to all five catalogs; update `adminDisputes` for the connection time
- [x] 4.7 Admin dispute attendance list shows `connectedAt` ("connected" marker) next to join/leave times

## 5. Infra — dev

- [x] 5.1 `infra/livekit/livekit.yaml` (dev keys, `port 7880`, `rtc.tcp_port 7881`, `rtc.udp_port 7882`, `node_ip 127.0.0.1`, `use_external_ip false`, TURN off, `room.max_participants 2`, `empty_timeout 300`, webhook → `http://api:4000/livekit/webhook`)
- [x] 5.2 `docker-compose.yml`: remove the five Jitsi services + `meet.jitsi` network; add `livekit` service (pinned image, config mount, ports 7880/7881 tcp); `Tiltfile`: replace Jitsi resources with `livekit`, api `resource_deps` updated; delete `infra/jitsi/`
- [x] 5.3 Two-tab local call works over TCP fallback (dev-environment scenario); document in `infra/README` / `.env.example` comments

## 6. Infra — k3s

- [x] 6.1 `infra/k8s/livekit/`: Deployment (`hostNetwork`, `ClusterFirstWithHostNet`, pinned image, resources per design 7, config Secret mount, TURN cert mount from `play-with-pro-meet-tls`), Service 7880, `livekit.yaml.tpl` (prod: `node_ip 152.53.186.65`, udp 7882, tcp 7881, TURN 3478/5349, webhook → `http://api:4000/livekit/webhook`)
- [x] 6.2 `apply-secrets.sh`: drop `jitsi-secrets`; render `livekit.yaml.tpl` with `envsubst` from the env file into Secret `livekit-config`; `env.example`: replace Jitsi block with `LIVEKIT_URL=wss://meet.play-with.pro`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- [x] 6.3 `ingress.yaml`: `meet.play-with.pro` → `livekit:7880` with TLS (cert-manager) and the api-style middleware set; update the site-gate comment (no iframe anymore)
- [x] 6.4 `deploy.sh`: apply `k8s/livekit/` instead of `k8s/jitsi/`, `rollout restart deploy/livekit` when `livekit-config` changed, wait for its rollout; delete `infra/k8s/jitsi/`
- [ ] 6.5 (README + one-off runbook written; host ufw swap and cluster cleanup still to run) Host: ufw swap (`10000/udp` → `7881/tcp`, `7882/udp`, `5349/tcp`; keep 3478); one-off `kubectl delete -f` of the old Jitsi manifests + `jitsi-secrets`; update `infra/k8s/README.md` (layout, ports, TURN cert restart note)

## 7. Verification & hand-off

- [ ] 7.1 Full smoke on the cluster: seed session → `room-window.sh --k8s open` → two browsers pre-join → call + synced player → attendance with `connectedAt`/`leftAt` visible in the admin dispute view
- [ ] 7.2 Real-browser matrix on the server: Chrome↔Firefox, Chrome↔Safari, Firefox↔Safari, iOS Safari↔desktop, Android Chrome↔desktop; confirm UDP path used (LiveKit connection stats), then force TCP (block 7882/udp client-side) and TURN/TLS (block UDP + 7881) — both must still connect
- [ ] 7.3 Resource audit during a call + transcode; adjust livekit limits; record freed headroom vs the Jitsi set
- [x] 7.4 Mark `add-production-deploy` tasks 5.1–5.6 and 7.1 as superseded by this change (note in its `tasks.md`)
- [x] 7.5 Docs: `openspec/project.md` video-call decision + roadmap entry (change 14), `design/DESIGN.md` provider note; lint/tsc/unit/e2e green; update memory
