# Tasks: add-production-deploy

## 1. Host & cluster foundation

- [x] 1.1 Pre-k3s ufw prep: allow pod/service CIDRs (10.42.0.0/16, 10.43.0.0/16) on the VPS
- [x] 1.2 Install k3s (single node, Traefik enabled); copy kubeconfig to the Mac (`~/.kube/playwithpro.yaml`, server=https://152.53.186.65:6443) and verify `kubectl get nodes` from the Mac
- [x] 1.3 Install cert-manager; create ClusterIssuers (letsencrypt-staging, letsencrypt-prod)
- [x] 1.4 Create namespace `playwithpro`; write `infra/k8s/README.md` describing layout and deploy flow
- [x] 1.5 Verify DNS: `play-with.pro`, `www`, `api`, `meet` all resolve to 152.53.186.65 (owner creates records if missing)

## 2. Images & secrets

- [x] 2.1 Production Dockerfile for api (multi-stage, pnpm/turbo, prisma engines, amd64)
- [x] 2.2 Production Dockerfile for web (Next.js standalone output, amd64; public env baked at build: API URL, Jitsi origin)
- [x] 2.3 `infra/scripts/build-push.sh`: buildx amd64 build tagged with git SHA → `docker save | ssh k3s ctr images import -`
- [x] 2.4 Define prod env contract (`infra/k8s/env.example` — S3, SMTP, JWT, DB, OAuth, JITSI_DOMAIN, AUTO_CONFIRM_WINDOW_HOURS, ROOM_JOIN_WINDOW_*); script `infra/scripts/apply-secrets.sh` creating k8s Secrets from `~/.playwithpro-prod.env`
- [x] 2.5 Owner inputs collected: Hetzner bucket + S3 keys ✓, SMTP creds ✓ (Brevo, domain authenticated, delivery verified to a real mailbox) → env file populated; Google OAuth prod redirect/creds still pending (Google login disabled in prod until then — non-blocking)

## 3. Data layer

- [x] 3.1 PostgreSQL manifests: StatefulSet/Deployment + local-path PVC + Service; resource limits
- [x] 3.2 Prisma migration Job manifest + deploy-script step (run & wait before app rollout)
- [x] 3.3 Nightly pg_dump CronJob shipping dumps to Object Storage; document restore procedure
- [x] 3.4 Smoke-verify S3 connectivity from api pod (pre-signed PUT/GET against Hetzner bucket)

## 4. Application workloads

- [x] 4.1 api Deployment (replicas=1) + Service; liveness/readiness probes; resource limits
- [x] 4.2 web Deployment + Service; probes; resource limits
- [x] 4.3 Ingress for play-with.pro / www / api.play-with.pro with cert-manager annotations (LE prod issued first try); www→apex redirect verified; WebSocket `/playback-sync` connects through Traefik ("Synced" badge in prod room); pre-launch basic-auth gate (`site-gate` middleware) added on web only
- [x] 4.4 CORS/origins config: api CorsIoAdapter + REST origins = https://play-with.pro; web NEXT_PUBLIC_* point at api.play-with.pro; **fix required and shipped**: `AUTH_COOKIE_DOMAIN=play-with.pro` (new env) — auth cookies must sit on the parent domain for web SSR to see them (dev shared localhost masked this)
- [ ] 4.5 End-to-end HTTP smoke: signup with real email code, login, catalog, booking with mock payment

## 5. Jitsi stack — SUPERSEDED by `replace-jitsi-with-livekit` (2026-09-09): the Jitsi manifests were replaced by `infra/k8s/livekit/`; 5.5/5.6 are not run against Jitsi, their LiveKit equivalents live in that change (tasks 7.1–7.2).

- [x] 5.1 Manifests for prosody, jicofo, jitsi-web (ClusterIP, official images, env per docker-jitsi-meet contract; Java heap caps)
- [x] 5.2 JVB Deployment with hostPort 10000/udp, `JVB_ADVERTISE_IPS=152.53.186.65`; coturn with hostPort 3478 udp+tcp
- [x] 5.3 Ingress meet.play-with.pro → jitsi-web with TLS; session-room iframe origin check (`JITSI_DOMAIN=https://meet.play-with.pro`) — prejoin renders inside the room page, fixture video plays from the bucket beside it
- [x] 5.4 Production custom-config.js: keep VP8-first + ssrcRewriting=false; DROP forceTurnRelay; p2p enabled (per design decision 6)
- [ ] ~~5.5~~ (superseded) Real-browser call matrix on the server: Chrome↔Firefox, Chrome↔Safari, Firefox↔Safari; if Safari↔FF p2p drop reproduces → flip p2p off and re-run
- [ ] ~~5.6~~ (superseded) Verify TURN fallback path works (client with UDP blocked joins via coturn 3478/tcp)

## 6. Operations tooling

- [x] 6.1 `room-window.sh` k8s mode (kubectl exec psql; auto-detect env or flag) — keep dev mode working
- [x] 6.2 Port smoke-session seed script into repo (`apps/api/prisma/seed-smoke.js`, runs in the api pod via kubectl) — accounts, paid video-analysis session, fixture video in bucket
- [x] 6.3 `infra/scripts/deploy.sh`: build → import → secrets check → migration Job → rollout → status; document rollback (`kubectl rollout undo`, DB restore)
- [x] 6.4 SCP snapshot note + pre-deploy snapshot guidance in infra/k8s/README.md

## 7. Verification & handoff

- [ ] ~~7.1~~ (superseded by `replace-jitsi-with-livekit` task 7.1) Full production smoke: seed session → room-window open → two-browser room (call + synced player) → confirm → escrow release visible in admin console
- [ ] 7.2 Synced-playback stutter re-test on server (open issue 2026-07-26): with/without sync toggle, with/without joining the call; record findings
- [ ] 7.3 Resource audit under load (RAM/CPU during a call + transcode); adjust limits; document headroom
- [ ] 7.4 Repo secret scan clean; lint/tsc/unit/e2e suites still green locally; update openspec/project.md roadmap (change 13) + memory
