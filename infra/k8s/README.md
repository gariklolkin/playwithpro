# Production deployment (k3s @ netcup)

Single-node k3s cluster on the netcup VPS `152.53.186.65` (Debian 13, 4 vCPU / 8 GB),
domain `play-with.pro`. Everything here is applied with kubectl from the operator's
machine — there is no CI/CD; the cluster is not managed from the server itself.

## Layout

```
infra/k8s/
  cluster/       # cluster-scoped: namespace, cert-manager ClusterIssuers
  postgres/      # PostgreSQL + PVC + backup CronJob
  app/           # api + web Deployments/Services/Ingress, migration Job
  livekit/       # LiveKit media server (host network) + config template
  env.example    # documented production env contract (no real values)
```

## Prerequisites (one-time, already done)

- Host: key-only root SSH, ufw (22/80/443/6443 tcp; LiveKit: 7881/tcp,
  7882/udp, 3478/udp, 5349/tcp — the former 10000/udp Jitsi rule is removed;
  allow from 10.42.0.0/16 and 10.43.0.0/16), unattended-upgrades, TZ=UTC.
- k3s installed via `curl -sfL https://get.k3s.io | sh -` (bundled Traefik).
- kubeconfig: `/etc/rancher/k3s/k3s.yaml` copied to the Mac as
  `~/.kube/playwithpro.yaml` with `127.0.0.1` → `152.53.186.65`.
- cert-manager (latest release manifest) + ClusterIssuers `letsencrypt-staging` /
  `letsencrypt-prod` (`cluster/issuers.yaml`).
- DNS A records: `@`, `www`, `api`, `meet` → 152.53.186.65 (Porkbun).

Use `export KUBECONFIG=~/.kube/playwithpro.yaml` in any shell that operates the cluster.

## One-off: retiring the Jitsi stack

The staging cluster was first provisioned with Jitsi (manifests never reached
git). Before the first LiveKit deploy, remove it by name — the old `jitsi`
Ingress claims the `meet.play-with.pro` host the new `meet` Ingress needs:

```bash
kubectl -n playwithpro delete deploy jitsi-prosody jitsi-jicofo jitsi-web jitsi-jvb jitsi-coturn --ignore-not-found
kubectl -n playwithpro delete svc jitsi-web ingress jitsi configmap jitsi-custom-config secret jitsi-secrets --ignore-not-found
```

Then swap the ufw rules on the host (`ufw delete allow 10000/udp`; allow
`7881/tcp`, `7882/udp`, `5349/tcp`; keep `3478`).

## Deploy flow

1. `infra/scripts/build-push.sh` — buildx amd64 images tagged with git SHA,
   shipped via `docker save | ssh k3s ctr images import -` (no registry).
2. `infra/scripts/apply-secrets.sh` — creates/updates k8s Secrets from
   `~/.playwithpro-prod.env` (never committed).
3. `infra/scripts/deploy.sh` — applies manifests, runs the Prisma migration Job,
   waits for it, then rolls app Deployments to the new image tags.

Rollback: `kubectl -n playwithpro rollout undo deploy/<name>`; database restores
from the nightly `pg_dump` objects in the Hetzner bucket.

## Conventions

- TLS: cert-manager annotations on Ingress; start new hosts on
  `letsencrypt-staging`, switch to `letsencrypt-prod` only after routing works
  (LE prod rate limits are easy to burn).
- api runs exactly 1 replica (in-memory playback-sync state — see
  `openspec/specs/synced-playback/`).
- Secrets only via `apply-secrets.sh`; manifests reference them by name.
  The script also renders `livekit/livekit.yaml.tpl` into Secret `livekit-config`
  so the api and the media server always share one key/secret pair.
- LiveKit runs on the host network (media cannot traverse the ingress) and
  reserves host ports 7880–7882, 3478 and 5349. It reads its config and the
  TURN certificate (the `meet.play-with.pro` ingress TLS Secret) at start
  only; `deploy.sh` restarts it when either changed, and after a cert-manager
  renewal outside a deploy run `kubectl -n playwithpro rollout restart deploy/livekit`.
- Before risky operations take a netcup SCP snapshot of the VPS.
