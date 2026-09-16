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
  fider/         # feedback board (Fider) Deployment/Service/Ingress + DB init Job
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
- DNS A records: `@`, `www`, `api`, `meet`, `feedback` → 152.53.186.65 (Porkbun).

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

## Observability (PostHog Cloud EU)

Error tracking, product analytics, session replay, feature flags and the
in-app support channel all run on one PostHog project (`add-product-observability`).
Project setup, keys and the dashboard live in `infra/posthog/README.md`;
the env contract is the *Observability* block of `env.example`. With every
`POSTHOG_*` value empty both apps are silent — that is the dev/CI state.

- **Keys**: `apply-secrets.sh` ships the server keys; `build-push.sh` bakes
  `NEXT_PUBLIC_POSTHOG_KEY` (+ replay sample) into the web image and passes
  the git SHA as `APP_RELEASE` to both images.
- **Source maps**: put a PostHog personal API key (error tracking: write)
  as a single line in `~/.playwithpro-posthog-cli`; `build-push.sh` mounts
  it as a build secret and the Dockerfiles inject/upload maps tagged with
  the SHA. Without the file the upload is skipped and builds still work.
- **Ingestion proxy**: the web app rewrites `/ph/*` to the EU ingestion
  hosts (`next.config.ts`); nothing else in the cluster needs to change and
  the basic-auth gate stays in front of it.
- **Kill switch**: the feature flag `add-product-observability-support-panel`
  hides the support entry points without a deploy. Unsetting the keys and
  redeploying turns the whole integration off.

### Support email channel (`support@play-with.pro`)

Mail to the support address must land in the PostHog inbox and replies must
leave from our domain passing SPF, DKIM and DMARC. Brevo already sends
transactional mail for the domain, so the SPF record is **merged**, not
replaced. Steps (Porkbun DNS):

1. In PostHog → Support → Channels → *Email*, add `support@play-with.pro`.
   PostHog shows a forwarding address and DKIM/verification records.
2. **Inbound**: the domain has no MX record today. Either add PostHog's MX
   (if offered) or an MX to a mailbox/forwarder (e.g. the registrar's email
   forwarding) that forwards `support@` to the PostHog inbox address.
3. **SPF**: one TXT at `@` including both senders, e.g.
   `v=spf1 include:spf.brevo.com include:<posthog spf include> ~all`
   (keep a single SPF record; two records = SPF permerror).
4. **DKIM**: add the CNAME/TXT records PostHog shows; verify in PostHog.
5. **DMARC**: keep the existing `p=none` policy until a round trip passes
   for both Brevo and PostHog, then tighten to `p=quarantine`.
6. Verify: send a mail to `support@play-with.pro` → ticket appears; reply
   from the inbox → the reply's raw headers show `spf=pass dkim=pass dmarc=pass`.

## Feedback board (Fider at feedback.play-with.pro)

Self-hosted [Fider](https://fider.io) (change 25, GitHub issue #3): one English,
votable idea board for coaches and players. Manifests in `fider/` (image pinned
to `getfider/fider:v0.36.0` — the latest release with a versioned image tag as
of 2026-09-16; v0.36.1 exists only as the moving `stable` tag, which we do not
use), own `fider` database and role in the in-cluster
Postgres, mail through the api's Brevo relay as `no-reply@play-with.pro`, no
integration with the app beyond two links (`NEXT_PUBLIC_FEEDBACK_URL`).

### First deploy

1. Add `FIDER_JWT_SECRET`, `FIDER_DB_PASSWORD` and `NEXT_PUBLIC_FEEDBACK_URL`
   to `~/.playwithpro-prod.env` (see `env.example`), run `apply-secrets.sh`
   (renders Secret `fider-env`).
2. Porkbun: `A feedback → 152.53.186.65`.
3. `deploy.sh <sha>` applies the init-db Job (idempotent: role, database,
   `REVOKE CONNECT ON DATABASE playwithpro FROM PUBLIC, fider`) and the board
   manifests. The Ingress starts on `letsencrypt-staging`.
4. Verify routing (`curl -kI https://feedback.play-with.pro` → 200/302), then
   switch the annotation to `letsencrypt-prod` in `fider/fider.yaml`, apply,
   and `kubectl -n playwithpro delete secret play-with-pro-feedback-tls` so
   cert-manager issues the production certificate.
5. Rebuild + deploy web with `NEXT_PUBLIC_FEEDBACK_URL` set (build-push.sh
   reads it from the env file): "Suggest an idea" appears in the user menu and
   the coach dashboard card.

### Board setup (first run, in the Fider UI)

1. Open the board: the first visitor registers the **administrator** account
   (owner) — do this right after the pod is ready, before sharing the URL.
2. Settings → General: site name "PlayWithPro ideas", welcome text along the
   lines of: "Suggest and vote on improvements to PlayWithPro. Problems with a
   session, payment or account? Use *Contact support* in the app instead."
   Set **Private** (invite-only) until launch.
3. Settings → Members: invite testers and coaches by email (sign-in is by
   email code only; do not enable OAuth providers).
4. Tags: `Coach`, `Player`, then areas `booking`, `payments`, `room`,
   `video analysis`, `profile` (public tags).
5. Statuses stay the defaults (open, planned, started, completed, declined).
   Convention: when an idea becomes **planned**, the response links the
   OpenSpec change id; **completed** links the staging deploy.
6. Launch: switch Private off in Settings → General (the launch checklist owns
   this step).

### Upgrade

Watch https://github.com/getfider/fider/releases. Before a bump: read the
notes (schema changes, minimum Postgres), confirm last night's `fider-*.pgdump`
exists in the bucket, then change the image tag in `fider/fider.yaml`, apply,
and check `kubectl -n playwithpro logs deploy/fider` for the migration output.

### Restore

Board dumps sit next to the app dumps under `backups/` (`fider-<date>.pgdump`).
Scale the board down, restore as the superuser into the `fider` database,
scale up:

```bash
kubectl -n playwithpro scale deploy/fider --replicas=0
kubectl -n playwithpro exec -i deploy/postgres -- pg_restore -U playwithpro -d fider --clean --if-exists --no-owner --role=fider < fider-<date>.pgdump
kubectl -n playwithpro scale deploy/fider --replicas=1
```

### Verification (issue #3)

- `https://feedback.play-with.pro` serves a valid production certificate and
  plain HTTP redirects to HTTPS.
- An uninvited visitor sees the private-board screen and cannot sign up.
- An invited coach's sign-in code arrives from `no-reply@play-with.pro`, not in spam.
- Post, vote, comment; setting a status emails the voters.
- The nightly backup object list shows a `fider-<date>.pgdump`; a scratch
  restore into a throwaway database succeeds.
- `psql "postgres://fider:<pw>@localhost/playwithpro"` from inside the
  postgres pod is refused (permission denied).
- With the build arg set, the menu item and the coach card open the board in
  a new tab in all five locales; without it, neither renders.
- `kubectl top pod` keeps the board under 256Mi; app pods unaffected.
