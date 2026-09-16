## Why

Coaches and players have no place to suggest improvements: ideas arrive in chats and calls, nobody else sees them, there is no count of how many people want the same thing, the roadmap is built from our own assumptions, and the person who asked never learns when it ships. Reviews (public, per coach), platform feedback ratings (change 20, private per session) and the support panel (change 24, private tickets) do not cover "I wish the platform had X". Owner decision 2026-09-15: a self-hosted Fider board, linked from the app (GitHub issue [#3](https://github.com/gariklolkin/playwithpro/issues/3)).

## What Changes

- **Self-hosted Fider on the k3s cluster** at `feedback.play-with.pro`: pinned image version, Traefik Ingress with the existing HTTPS redirect, cert-manager TLS (staging issuer first), a separate `fider` database and user in the existing Postgres (no access to the app database), the existing Brevo SMTP relay for sign-in codes and notifications, a dedicated Secret rendered by `apply-secrets.sh`, inclusion in the nightly `postgres-backup` dump, small resource requests/limits, manual `A` record in Porkbun, deploy/upgrade/restore steps in the k8s README.
- **Board setup (operator steps, documented):** one English board, private/invite-only until launch (testers and invited coaches get real accounts — the basic-auth gate is not used), "Coach"/"Player" tags plus area tags (booking, payments, room, video analysis, profile), default statuses with "planned" linking to the OpenSpec change, a welcome text pointing problems to the support panel, email sign-in codes only, the owner as admin.
- **Links from the app (L0, no integration):** "Suggest an idea" in the navbar user menu and a "Help shape the platform" card on the coach dashboard, both opening the board in a new tab with `?utm_source=app&utm_content=<placement>`. Labels localized in five locales; the board itself stays English. Configured through a new `NEXT_PUBLIC_FEEDBACK_URL` build arg; when unset the links are hidden (default for local dev and CI). Not placed in the session room or on error screens — those belong to support.

## Capabilities

### New Capabilities

- `feedback-board`: the public, votable feature-request board (hosting contract, board configuration) and the app's entry points to it.

### Modified Capabilities

- `production-deploy`: "Public HTTPS endpoints" gains `https://feedback.play-with.pro`; "Database backups leave the host" covers the `fider` database; new requirement for the feedback-board workload (own database user isolated from the app database, dedicated Secret, SMTP relay, resource limits, pinned version).

_`i18n` is not modified: the link labels fall under "Complete message catalogs"._

## Impact

- **Infra:** new `infra/k8s/fider/` (Deployment, Service, Ingress, one-shot DB init Job), `infra/k8s/postgres/backup-cronjob.yaml` (second dump), `infra/scripts/apply-secrets.sh` (renders Secret `fider-env`), `infra/scripts/deploy.sh` (applies the Fider manifests), `infra/k8s/env.example` (`FIDER_JWT_SECRET`, `FIDER_DB_PASSWORD`, `NEXT_PUBLIC_FEEDBACK_URL`), `infra/k8s/README.md` (deploy, upgrade, restore, board setup, DNS). `apps/web/Dockerfile.prod` gains the `NEXT_PUBLIC_FEEDBACK_URL` build arg.
- **Web:** `lib/feedback-url.ts` (URL + UTM builder, null when unset), `components/user-menu.tsx` (+ item, `target="_blank" rel="noopener"`), `app/[locale]/dashboard/page.tsx` (coach card). New keys `nav.suggestIdea`, `dashboard.professional.feedback.*` ×5.
- **API:** untouched.
- **Cost:** $0 — open-source Fider on the existing node, Postgres, bucket and SMTP.
- **Non-goals (explicit; later options decided by usage):** Google sign-in on Fider (L1), "Sign in with PlayWithPro" OAuth (L2), an in-app proxied idea form and top-ideas list (L3), Fider webhooks into the app, per-language or per-side boards, per-session platform ratings (change 20), support for problems (change 24), making the board public (launch decision).
