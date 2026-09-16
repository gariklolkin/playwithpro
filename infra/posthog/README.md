# PostHog project setup (operator steps)

One PostHog Cloud **EU** project, free tier, used for production only. Local
dev and CI never set a key, so they send nothing. Everything below is done
once by the operator in the PostHog UI; the app needs only the env values
listed in `infra/k8s/env.example`.

## 1. Project and keys

1. Sign up at https://eu.posthog.com (EU region — do not use the US host).
2. Create project **PlayWithPro production**. Copy:
   - **Project API key** (`phc_…`) → `POSTHOG_API_KEY` and `NEXT_PUBLIC_POSTHOG_KEY`.
   - **Project secret API key** (`phs_…`, Project settings) or a personal
     API key with *feature flag: read* → `POSTHOG_PERSONAL_API_KEY`
     (local flag evaluation in the API and the web server).
   - **Support → Secret API key** → `POSTHOG_SUPPORT_SECRET` (HMAC identity
     for the in-app support panel).
   - A **personal API key** with *error tracking: write* → one line in
     `~/.playwithpro-posthog-cli` on the operator machine (source-map upload
     during `infra/scripts/build-push.sh`; never committed, never in an image).
3. Fill the values in `~/.playwithpro-prod.env`, run
   `infra/scripts/apply-secrets.sh`, then `build-push.sh` + `deploy.sh`
   (the web bundle bakes the client key at build time).

## 2. Project settings

- **Internal and test users** (Project settings → Product analytics): add a
  filter `internal = true`. The web identifies admins and dev-fixture
  accounts (`@example.com`, `@e2e.test`) with that person property.
- **Session replay**: enable; keep *mask all inputs* on (the SDK also masks
  `[data-ph-mask]` elements and strips codes/tokens/signatures from URLs);
  set **minimum duration 5 s**; sampling is set client-side by
  `NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE` (default 0.5) and can be lowered
  without a deploy from *Replay → Settings → sampling* if the allowance runs low.
- **Error tracking**: enable; symbol sets appear automatically after the
  first build with the CLI token (release = deploy SHA).
- **Feature flags**: create `add-product-observability-support-panel`
  (boolean, 100 % on). Turning it off hides every support entry point
  without a deploy (the kill switch for a misbehaving inbox).
- **Support (Conversations)**: enable the product, no default launcher
  needed (the app renders its own panel); connect the email channel per
  `infra/k8s/README.md` → *Observability → Support email channel*.
- **Usage alerts** (Organization → Billing): email alerts at **50 %** of
  each free allowance (events, replays, exceptions, flag requests). Once a
  card is added at launch, set **billing limits** per product at the free
  allowance so an incident can never produce a bill.

## 3. Dashboard

`dashboard.json` in this folder describes the starter dashboard (booking
funnel, paid sessions by service, money outcomes, errors by release, error
rate, consent estimate). Recreate the tiles in the UI (each tile lists its
events, breakdown and interval) or script it against the dashboards API —
the JSON is the source of truth for what the tiles must show.

## 4. Verification checklist

Run after the first production deploy with keys set (behind the gate):

- Decline the banner → no request to `/ph/*` in the network tab while browsing.
- Accept → `$pageview` for the current page arrives; the person shows
  `role`, `locale`, `internal`.
- Force a web error (temporary `throw` in a page) and an API 500 → both
  appear in Error tracking with readable frames and `release` = the deploy SHA.
- Full test booking → funnel shows every step; `session_paid` and
  `session_completed` come from the API (`$lib` = posthog-node).
- Open a replay → inputs masked, dispute text and admin console masked, no
  `code=`/`token=`/`X-Amz-Signature=` in URLs or network entries.
- Toggle the support flag off → entry points disappear on the next render.
- Support round trip in two locales (panel → inbox → reply → panel); the
  ticket shows the user's identity and, with consent, the replay link.
- Email `support@play-with.pro` → ticket; reply from the inbox → delivered
  with SPF/DKIM/DMARC passing (check the raw headers).
- Dev and CI: no `POSTHOG_*` set → zero ingestion requests (grep the logs).
- After a week: usage well inside every free allowance.
