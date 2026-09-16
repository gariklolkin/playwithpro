## 1. Cluster workload

- [x] 1.1 `infra/k8s/fider/fider.yaml`: Deployment (pinned `getfider/fider:v0.36.0` — v0.36.1 has no versioned image tag, only `stable`, `GO_ENV`, `BASE_URL`, `envFrom fider-env`, probes, `requests 100m/128Mi`, `limits 256Mi`), Service, Ingress `feedback.play-with.pro` (redirect-https, `letsencrypt-staging`, TLS secret `play-with-pro-feedback-tls`, no site-gate)
- [x] 1.2 `infra/k8s/fider/init-db-job.yaml`: idempotent role + database creation and `REVOKE CONNECT ON DATABASE playwithpro FROM PUBLIC, fider`
- [x] 1.3 `apply-secrets.sh`: render Secret `fider-env` (`DATABASE_URL`, `JWT_SECRET`, `EMAIL_SMTP_*`, `EMAIL_NOREPLY=no-reply@play-with.pro`) from `FIDER_JWT_SECRET`, `FIDER_DB_PASSWORD` + SMTP keys; fail when missing; `env.example` documents the keys and `NEXT_PUBLIC_FEEDBACK_URL`
- [x] 1.4 `deploy.sh`: apply `infra/k8s/fider/` after the app manifests
- [x] 1.5 `backup-cronjob.yaml`: second `pg_dump` for `fider`; README restore steps for both databases

## 2. Web entry points

- [x] 2.1 `lib/feedback-url.ts` (`feedbackUrl(placement)` → URL with `utm_source=app&utm_content=<placement>` or `null`) + unit test for both cases
- [x] 2.2 `user-menu.tsx`: "Suggest an idea" item (`target="_blank" rel="noopener"`) when configured; `navbar.tsx` passes the label
- [x] 2.3 `dashboard/page.tsx`: "Help shape the platform" card for the professional role when configured
- [x] 2.4 `Dockerfile.prod`: `ARG NEXT_PUBLIC_FEEDBACK_URL=` → env; build recipe in the README passes the production value
- [x] 2.5 i18n: `nav.suggestIdea`, `dashboard.professional.feedback.{title,body,cta}` ×5; tests: links rendered with a URL, absent without

## 3. Runbook and verification

- [x] 3.1 `infra/k8s/README.md` "Feedback board" section: DNS record, staging→prod issuer switch, first-run admin, private mode, invites, tags, welcome text (points problems to support), statuses convention, upgrade procedure and release feed, launch step (make public)
- [ ] 3.2 Production checklist (issue #3): valid LE prod cert + HTTP→HTTPS; uninvited visitor blocked; invited coach receives the code from our domain, not in spam; post/vote/comment + status email; nightly backup contains a `fider` dump and a scratch restore works; `fider` role cannot connect to `playwithpro`; menu item and coach card in all five locales open the board in a new tab; no links without the build arg; pod within limits, app pods unaffected
- [ ] 3.3 Roadmap line 25 in `openspec/project.md` updated (done 2026-09-16); archive after the production checklist 3.2
