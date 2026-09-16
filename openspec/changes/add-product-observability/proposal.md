## Why

The platform runs on the production cluster behind the pre-launch gate and we are blind to it: no exception reporting in web or API, no booking-funnel data, no way to see what a tester saw, no kill switch for a misbehaving feature, no in-app help channel (and `support@play-with.pro` cannot receive mail), and no consent handling although fr/de visitors are first-class. The launch decision (removing the gate) needs a measured funnel and error rate from the gated period. Owner decision 2026-09-15: PostHog is the single vendor for analytics, feature flags, error tracking and support (GitHub issue [#2](https://github.com/gariklolkin/playwithpro/issues/2)).

## What Changes

- **Provider abstractions.** `Analytics`, `ErrorReporter`, `FeatureFlags` interfaces on both apps, with a PostHog implementation and a no-op implementation selected by configuration. Business code never imports the vendor SDK. **No token configured means nothing is sent** — the default for local dev and CI.
- **Consent and privacy.** A localized consent banner (5 locales) before any capture; declining keeps the app fully functional; the choice can be changed later from the privacy page and the user menu. A minimal localized privacy page lists what is collected and why.
- **Error tracking.** Web: client exception capture, `error.tsx` / `global-error.tsx` boundaries, server-side `onRequestError`. API: a global exception filter reporting 5xx and unexpected exceptions (never expected 4xx). Source maps uploaded during the image build; events carry `environment` and `release` (git SHA = image tag). Deduplication and rate limiting so a reconnect loop cannot exhaust the free allowance.
- **Product analytics.** Pageviews plus a named booking funnel (catalog → coach page → slot → checkout → paid → room joined → confirmed) and disputes/cancellations. Money and lifecycle events (paid, completed, refunded, disputed) are emitted by the API as the source of truth. Users identified by user id with role and locale; email only for support identification; internal and test accounts filtered out. A starter dashboard.
- **Session replay.** All inputs masked; sensitive text masked (dispute text, player "about", admin console); URLs sanitized before sending (password-reset code, LiveKit tokens, pre-signed S3 signatures) in both `$current_url` and captured network requests; sampling and a minimum recording length.
- **Feature flags.** Server-evaluated for SSR and bootstrapped to the client (no flicker, no per-component requests). Convention: a flag is named after its OpenSpec change and removed when the change is archived; kill switches may stay.
- **Support.** A localized in-app support panel (our UI + next-intl strings) on PostHog's conversations API, identity-verified for signed-in users via an API-computed HMAC; anonymous visitors can write. Entry points: user menu, error screens (error attached), failed payment, session room ("can't connect"), dispute form. Email channel for `support@play-with.pro` set up manually by the operator (MX/forwarding, merged SPF, PostHog DKIM, DMARC kept), documented in the k8s README.
- **Ingestion proxy.** `posthog-js` talks to a same-origin path proxied by the web server so ad-blockers do not silently drop data.
- **Free-tier guardrails.** Usage alerts at 50 % of each allowance; per-product billing limits once a card is added.

## Capabilities

### New Capabilities

- `analytics-consent`: consent banner and privacy page, opt-in capture, user identification rules, the named booking funnel and API-emitted lifecycle events, session-replay masking/sanitizing/sampling, the no-token-means-silent rule and provider abstraction on both apps.
- `error-reporting`: web and API exception capture with release/environment tags, readable stack traces from uploaded source maps, deduplication and rate limiting.
- `feature-flags`: server-evaluated, client-bootstrapped flags with the OpenSpec naming convention and API-side evaluation.
- `support-channel`: the localized in-app support panel, identity verification, entry points, and the operator-run email channel.

### Modified Capabilities

- `production-deploy`: "Secrets stay out of the repository" gains the PostHog keys; new requirements for the observability env contract (build args and runtime env, silent when unset), source-map upload during the image build, and the same-origin ingestion proxy.

_`i18n` is not modified: the new catalogs fall under the existing "Complete message catalogs" requirement._

## Impact

- **Dependencies:** `posthog-js` (web), `posthog-node` (web server + API), `@posthog/cli` (build stage only, source maps).
- **Web:** `lib/observability/` (analytics, flags, errors, consent), `components/consent/`, `components/support/`, `app/[locale]/error.tsx`, `app/global-error.tsx`, `instrumentation.ts`, `app/[locale]/privacy/page.tsx`, rewrites in `next.config.ts`, layout wiring (identify/bootstrap), entry points in user menu, checkout, session room, dispute form. New namespaces `consent`, `privacy`, `support`, `errors` ×5.
- **API:** new `observability` module (`ANALYTICS`, `ERROR_REPORTER`, `FEATURE_FLAGS` tokens, PostHog + no-op providers, global exception filter), lifecycle events from `SettlementService`, `BookingsService`, `DisputesService`, `SessionRoomsService`; `GET /support/identity` (HMAC). `env.validation.ts` gains optional `POSTHOG_*` vars.
- **Infra:** `apps/{web,api}/Dockerfile.prod` build args for release + source-map upload with a build secret; `infra/k8s/env.example`, `infra/k8s/README.md` (PostHog project setup, email channel DNS steps, usage alerts); `infra/scripts/deploy.sh` passes the SHA as release.
- **Data protection:** only user id, role, locale, and (for support) email leave the platform; replay content is masked; PostHog EU region. The privacy page documents this.
- **Non-goals (explicit):** logs/metrics/tracing (OpenTelemetry later; the abstractions must not block it), surveys and feedback collection (Fider, change 25), uptime monitoring/alerting for `/health` and the media server, PostHog AI reply agent, a separate dev project, removing the basic-auth gate.
