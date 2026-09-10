# Proposal: add-production-deploy

## Why

All 12 roadmap changes are implemented, but the product exists only in the local Tilt dev environment — no real user can reach it. A production server (netcup VPS, 152.53.186.65) and domain (play-with.pro) are now provisioned; this change puts the marketplace on the public internet with real TLS, real object storage, and real email, so the video room and the full booking flow can be validated end-to-end outside the dev machine (including the open synced-playback stutter issue that could not be diagnosed locally).

## What Changes

- Single-node k3s cluster on the netcup VPS (Debian 13, 4 vCPU / 8 GB, x86) hosts the whole stack; deploy tooling runs from the owner's Mac via kubectl.
- Kubernetes manifests for: web (Next.js), api (NestJS), PostgreSQL (persistent volume), and the self-hosted Jitsi stack (web / prosody / jicofo / jvb / coturn) — JVB UDP 10000 and coturn 3478 exposed via hostPort.
- Ingress (k3s bundled Traefik) + cert-manager with Let's Encrypt certificates for `play-with.pro`, `www.play-with.pro`, `api.play-with.pro`, `meet.play-with.pro`.
- Hetzner Object Storage (S3-compatible) replaces MinIO in production via existing `StorageModule` env switch — no code changes to storage logic.
- Real SMTP provider replaces Mailpit in production (env-driven; provider account supplied by owner).
- Production Jitsi configuration over HTTPS: revisit the four dev-only `custom-config.js` workarounds (codec order, p2p off, forced TURN relay, SSRC rewriting) — keep what is universal, drop what was Rancher-Desktop-specific; consider re-enabling p2p for 1:1 calls.
- Prisma migrations applied as a deploy step (Job/initContainer) — schema is settled truth before app pods roll.
- Container images built for amd64 (owner's Mac is arm64 — cross-build via buildx) and delivered to the cluster without a paid registry.
- Production-compatible operational scripts: `room-window.sh` variant using `kubectl exec` instead of `docker exec`, and the smoke-session seed script (accounts + fixture video) bundled into the repo.
- Post-deploy verification pass: full booking → payment (mock) → video room smoke test in real browsers, including re-test of the synced-playback stutter issue.
- Explicit non-goals: PaymentProvider stays mock (real PSP is its own change); Google Calendar/Meet integration unchanged (.ics email only); no CI/CD pipeline (deploys run from the Mac); no monitoring stack beyond basics; no separate staging environment.

## Capabilities

### New Capabilities

- `production-deploy`: how the platform runs in production — cluster topology, ingress/TLS, DNS names, storage and email backing services, Jitsi production configuration, image build/delivery, migration policy, operational scripts (join-window override, smoke seed), and the security baseline of the host (key-only SSH, ufw, UTC).

### Modified Capabilities

<!-- none — production deployment changes no application-level requirements; storage, email, and video providers are already abstracted behind env-driven interfaces -->

## Impact

- **New infra artifacts**: `infra/k8s/**` manifests, cert-manager config, production Jitsi config, deploy scripts (`infra/scripts/deploy.sh` or Makefile targets), prod variants of `room-window.sh` and seed script.
- **Env/config**: production `.env` contract for api and web (S3 endpoint/bucket/keys, SMTP host/creds, `JITSI_DOMAIN=https://meet.play-with.pro`, public URLs, Google OAuth redirect); secrets live on the server/cluster, never in the repo.
- **Dockerfiles**: production images for web and api (standalone Next.js build, NestJS dist) if the existing dev images are not prod-ready.
- **Unchanged**: application source code paths are expected to need zero-to-minimal changes (env-driven provider switches only); local Tilt dev environment stays as is.
- **External dependencies**: netcup VPS (owner-paid), Hetzner Object Storage bucket + credentials, SMTP provider account, DNS A records for play-with.pro → 152.53.186.65 (owner action).
