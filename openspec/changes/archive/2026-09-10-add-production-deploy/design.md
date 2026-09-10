# Design: add-production-deploy

## Context

The whole stack currently runs only under Tilt on the owner's Mac (docker-compose services incl. self-hosted Jitsi over plain HTTP on localhost). Provisioned production host: netcup VPS 1000 G12 — 152.53.186.65, Debian 13, 4 vCPU / 8 GB / 251 GB NVMe, x86-64. Host baseline already applied outside this change: key-only root SSH, ufw (22/80/443/6443 tcp, 10000 udp, 3478 udp+tcp), unattended-upgrades, TZ=UTC. Domain `play-with.pro`; A records for `@`, `www`, `api`, `meet` → the VPS. Owner's Mac is arm64; server is amd64. Constraints: single server (no separate staging), no paid registry, secrets never in the repo, mock payments stay, synced-playback assumes a single API instance.

## Goals / Non-Goals

**Goals:**
- Public, TLS-terminated deployment of web, api, PostgreSQL, and Jitsi on one k3s node, reproducible from the repo with scripts runnable from the owner's Mac.
- Production backing services: Hetzner Object Storage for videos, real SMTP for signup codes and .ics invites.
- A Jitsi configuration that works in real cross-browser calls over the public internet, shedding dev-only workarounds where possible.
- Operational parity with dev: join-window override script and smoke-session seed work against the cluster.

**Non-Goals:**
- Real payment provider, Google Calendar/Meet, CI/CD, monitoring/alerting stack, horizontal scaling, separate staging, JaaS.

## Decisions

1. **k3s single-node, bundled Traefik as ingress.** k3s is the lightest certified k8s for one box and the owner explicitly chose Kubernetes. Keep the bundled Traefik rather than installing ingress-nginx — one less moving part, and Traefik handles WebSocket upgrades (socket.io `/playback-sync`) out of the box. *Alternative rejected:* docker-compose (owner decision), full kubeadm (overhead without benefit on 8 GB).

2. **cert-manager with Let's Encrypt HTTP-01, one Certificate per hostname group.** Standard, declarative, renewals handled in-cluster. *Alternative rejected:* Traefik's built-in ACME — cert storage tied to Traefik pod lifecycle, weaker ecosystem support.

3. **Image delivery without a registry: `docker buildx build --platform linux/amd64` on the Mac → `docker save | ssh … 'k3s ctr images import -'`.** Zero external dependencies and no credentials to manage; deploy script pins images by content digest tag (git SHA) so rollouts are deterministic and `rollout undo` works. Cross-building Next.js under QEMU is slow but acceptable for MVP cadence. *Alternatives rejected:* ghcr.io (adds account/token setup — can be adopted later without design changes), in-cluster registry (one more stateful service on a small box).

4. **PostgreSQL in-cluster** (single replica, k3s local-path PV) **plus a nightly `pg_dump` CronJob shipping dumps to the Object Storage bucket.** netcup has no managed DB; local-path is fine for one node. Backup goes off-box because the box is the failure domain. *Alternative rejected:* managed DB (cost, latency, MVP scope).

5. **Jitsi from official docker images, one Deployment per component.** prosody/jicofo/jitsi-web are ClusterIP-internal; `meet.play-with.pro` routes to jitsi-web via ingress (TLS at Traefik, HTTP inside — same pattern as the dev direct-iframe embed, now on a real secure origin). **JVB and coturn use hostPort** (UDP 10000, 3478 udp+tcp) with `JVB_ADVERTISE_IPS=152.53.186.65` — WebRTC media cannot traverse the ingress. *Alternative rejected:* hostNetwork for the whole Jitsi stack (port collision risk, loses cluster DNS ergonomics).

6. **Production Jitsi config starts from evidence, not from a copy of dev:**
   - **Keep** `codecPreferenceOrder ['VP8','H264','VP9']` — the AV1-first image default breaking Firefox negotiation is browser-level, not environment-level.
   - **Keep** `ssrcRewritingEnabled=false` initially — the FF zero-remote-tracks bug was JVB-path, plausibly environment-independent; revisit only after stable calls.
   - **Drop** `forceTurnRelay=true` — it existed solely because Rancher Desktop broke direct UDP; on a real public IP, direct UDP to JVB must work. coturn stays as a fallback for NAT-restricted clients (now with valid TLS possible).
   - **Re-test p2p**: enable `p2p` for 1:1 calls on the server (offloads JVB on a 4-core box); the dev Safari↔Firefox p2p drop must be re-verified on the real origin before deciding. Ship with p2p ON, fall back to OFF if the drop reproduces.

7. **Prisma migrations as a dedicated k8s Job** run by the deploy script before rolling app images (`prisma migrate deploy`). Single API replica means no multi-writer race; a Job (vs initContainer) gives clean logs, explicit failure, and no restart-loop side effects.

8. **Secrets: `kubectl create secret … --from-env-file` fed by `~/.playwithpro-prod.env` on the owner's Mac.** The file is the single source of prod credentials (S3 keys, SMTP, JWT, DB password, Google OAuth); nothing lands in the repo. *Alternative rejected:* SOPS/sealed-secrets — ceremony without threat-model justification for a one-operator project.

9. **Replica counts: api=1 (hard requirement — in-memory playback-sync state), web=1, everything else=1.** Scale-out is explicitly the Redis-adapter change noted in the synced-playback spec.

10. **ufw/k3s interplay:** allow traffic from pod/service CIDRs (10.42.0.0/16, 10.43.0.0/16) before installing k3s; otherwise default-deny silently breaks CNI. 6443 stays open so kubectl runs from the Mac (kubeconfig copied once over SSH).

11. **Prod Dockerfiles (multi-stage)**: web — Next.js standalone output; api — NestJS dist + prisma engines; both pnpm/turbo-aware. Dev Tilt flow is untouched.

## Risks / Trade-offs

- [Single box dies] → SCP snapshots before risky operations; nightly DB dumps + videos already off-box in Object Storage; manifests re-create everything on a fresh node.
- [QEMU cross-build too slow for iteration] → acceptable for deploy cadence; escape hatch: `docker buildx` remote builder on the server itself or ghcr.io + native runners later.
- [p2p re-enable reproduces Safari↔FF drop] → config flag flip back to `p2p.enabled=false` (decision 6 keeps both paths tested).
- [8 GB RAM ceiling: k3s (~1 GB) + Jitsi Java heap + Postgres + apps] → set explicit resource requests/limits; JVB/jicofo heap caps via env; measured headroom is part of the verification pass.
- [ufw + kube-proxy/flannel conflicts] → CIDR allowances (decision 10) applied and smoke-tested before app rollout.
- [Let's Encrypt rate limits during setup fumbling] → use staging issuer until ingress/DNS verified, then switch to prod issuer.
- [Traefik WebSocket idle timeouts breaking playback-sync] → socket.io ping keeps connections warm; verify in smoke test, tune Traefik timeouts only if needed.

## Migration Plan

Fresh install, no data to migrate. Order: k3s install (with ufw CIDR prep) → cert-manager + staging issuer → namespaces/secrets → Postgres (+ migration Job) → api + web + ingress (staging TLS) → switch to prod issuer → Jitsi stack → smoke pass (booking → payment → room; both room-window.sh-k8s and seed script) → synced-playback stutter re-test → DNS already pointing (records created up-front). Rollback: `kubectl rollout undo` per deployment; images pinned by git-SHA tags; DB restores from nightly dumps.

## Open Questions

- SMTP provider account (Brevo/Resend/Postmark) — owner to create; SMTP env contract is provider-agnostic.
- Google OAuth prod client vs added redirect URI on the dev client — owner's Google Cloud console action; either works with env config.
- Does the synced-playback stutter reproduce on the server at all (open issue from 2026-07-26)? Outcome decides whether drift-snap tuning enters a follow-up change.
