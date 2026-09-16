## Context

The cluster is a single k3s node with Traefik, cert-manager (`letsencrypt-staging`/`-prod` ClusterIssuers), an in-cluster `postgres:17` Deployment whose superuser credentials live in Secret `playwithpro-env`, a nightly `postgres-backup` CronJob shipping `pg_dump` files to the Hetzner bucket, and Brevo SMTP for the API's transactional mail (`SMTP_FROM=PlayWithPro <no-reply@play-with.pro>`). Secrets are rendered by `apply-secrets.sh` from `~/.playwithpro-prod.env`; `deploy.sh <sha>` applies manifests with `__TAG__` substitution. The web UI is behind a basic-auth gate; the API and meet hosts are not. The web app bakes `NEXT_PUBLIC_*` at build time.

Constraints: no integration between the app and Fider in this change (L0); $0; the board must not weaken the app's database isolation; the board is invite-only until launch.

## Goals / Non-Goals

**Goals:** a working, backed-up, TLS-served Fider at `feedback.play-with.pro`; two localized links from the app that vanish when unconfigured; operator docs good enough to upgrade and restore without this change's author.

**Non-Goals:** SSO with the app, proxied forms, webhooks, per-language boards, exposing the board publicly (launch checklist).

## Decisions

1. **Manifests in `infra/k8s/fider/`, applied by `deploy.sh`.** `fider.yaml`: Deployment (`getfider/fider:<pinned>`, 1 replica, `Recreate`, `GO_ENV=production`, `BASE_URL=https://feedback.play-with.pro`, `envFrom: secretRef fider-env`, readiness on `/`, `requests: 100m/128Mi`, `limits: 256Mi`), Service, Ingress (host `feedback.play-with.pro`, `redirect-https` middleware, `letsencrypt-staging` annotation to start, TLS secret `play-with-pro-feedback-tls`). The version is pinned in the manifest and bumped deliberately; the README lists the release feed to watch. The site-gate middleware is **not** applied — Fider's private mode covers pre-launch access with real accounts.

2. **Own database and role, isolated by REVOKE.** A one-shot, idempotent `init-db-job.yaml` runs `psql` as the Postgres superuser (from `playwithpro-env`): create role `fider` (password from `FIDER_DB_PASSWORD`) and database `fider` owned by it if missing, then `REVOKE CONNECT ON DATABASE playwithpro FROM PUBLIC` and `FROM fider` (the app role owns `playwithpro`, so it keeps access). Fider runs its own migrations on start. *Alternative rejected:* a second Postgres Deployment — memory on the single node and a second backup path for a small app.

3. **Secret `fider-env` rendered by `apply-secrets.sh`** from new env-file keys: `FIDER_JWT_SECRET` (`openssl rand -hex 32`), `FIDER_DB_PASSWORD`, and the existing `SMTP_HOST/PORT/USER/PASSWORD`, rendered as Fider's `DATABASE_URL=postgres://fider:<pw>@postgres:5432/fider?sslmode=disable`, `JWT_SECRET`, `EMAIL_SMTP_HOST/PORT/USERNAME/PASSWORD`, `EMAIL_NOREPLY`. The script fails when either Fider key is missing, mirroring the LiveKit keys. `env.example` documents all of it.

4. **Sender address = the app's `no-reply@play-with.pro`.** The issue says `noreply@`; using the exact address already verified in Brevo avoids a second sender identity and keeps SPF/DKIM unchanged. Recorded as a deliberate deviation from the issue text.

5. **Backups: same CronJob, second dump.** The `dump` init container runs a second `pg_dump -Fc` for `fider` into `/backup/fider-<date>.pgdump`; the upload step already copies the whole directory. Restore steps for both databases documented (`pg_restore -d fider` as the `fider` role). *Alternative rejected:* a separate CronJob — duplicated credentials and schedule for one extra line.

6. **Web link builder without runtime config.** `lib/feedback-url.ts`: `feedbackUrl(placement)` returns `null` when `NEXT_PUBLIC_FEEDBACK_URL` is empty, else the URL with `utm_source=app&utm_content=<placement>` (`user-menu`, `coach-dashboard`). Both placements render only when the builder returns a URL, as `<a target="_blank" rel="noopener">` (a plain anchor — external origin, no locale prefix). `Dockerfile.prod` gets `ARG NEXT_PUBLIC_FEEDBACK_URL=` (empty default keeps local/CI builds link-free); the production build recipe passes `--build-arg NEXT_PUBLIC_FEEDBACK_URL=https://feedback.play-with.pro`. After change 24 lands, PostHog counts the clicks by `utm_content`; no code change needed here.

7. **Board configuration is an operator runbook, not code.** README section "Feedback board": DNS `A` record in Porkbun → verify staging cert → switch to `letsencrypt-prod` and delete the staging TLS secret → first-run admin registration (owner) → private mode → invite testers/coaches → tags → welcome text → statuses convention ("planned" links the OpenSpec change) → the launch step (make public). Fider stores all of this in its own database, which the backup covers.

## Risks / Trade-offs

- [Fider upgrade breaks its schema or needs a newer Postgres] → pinned version, release notes read before a bump, backup verified before every upgrade; Postgres 17 is above Fider's minimum.
- [Sign-in codes land in spam] → same Brevo relay and sender as the app's verified mail; verification step in tasks checks inbox placement.
- [The board pod competes with LiveKit/ffmpeg for memory] → 256 Mi limit and a low CPU request; the node has headroom per the current requests.
- [A tester shares the board URL before launch] → private mode; uninvited visitors see nothing.
- [Locale mismatch: French UI, English board] → accepted for L0 and stated in the welcome text; L1–L3 options are decided by usage.

## Migration Plan

1. Add the env keys, run `apply-secrets.sh`, apply `init-db-job.yaml`, apply the Fider manifests (staging issuer), add the DNS record, verify, switch to the prod issuer.
2. Rebuild web with `NEXT_PUBLIC_FEEDBACK_URL`, deploy; links appear.
3. Rollback: remove the build arg and redeploy web (links vanish); scale Fider to 0 or delete its manifests; the `fider` database and dumps can stay.

## Open Questions

None. Version pin is chosen at implementation time (latest stable release).
