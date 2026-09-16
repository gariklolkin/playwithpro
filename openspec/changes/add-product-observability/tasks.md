## 1. Foundation and abstractions

- [x] 1.1 Add `posthog-js`, `posthog-node` (web + api) and `@posthog/cli` (build only); pin versions; confirm the conversations JS API surface for decision 9 — pinned `posthog-js@1.433.5`, `posthog-node@5.52.4`, `@posthog/cli@0.18.2`; `posthog.conversations` exposes `isAvailable/sendMessage/getMessages/markAsRead/getCurrentTicketId` and `posthog.setIdentity(distinctId, hmac)` → our own UI (no widget fallback needed)
- [x] 1.2 API `observability` module: `Analytics`/`ErrorReporter`/`FeatureFlags` interfaces, tokens, `PosthogProvider` (single client, flush on shutdown, `environment` + `release` on every event) and `NoopProvider`; selection by `POSTHOG_API_KEY`; optional `POSTHOG_API_KEY`, `POSTHOG_HOST`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_SUPPORT_SECRET`, `APP_RELEASE` in `env.validation.ts`
- [x] 1.3 Web `lib/observability/`: `analytics.ts`, `errors.ts`, `flags.ts`, `consent.ts`, `support.ts` with the no-op path when `NEXT_PUBLIC_POSTHOG_KEY` is empty; `ObservabilityProvider` client component; `next.config.ts` rewrites for `/ph` (+ `skipTrailingSlashRedirect`)
- [x] 1.4 Unit tests: no-op providers make zero network calls; PostHog providers tag environment/release; dedupe/rate-limit algorithm (both apps)

## 2. Consent and privacy

- [x] 2.1 `consent.ts`: cookie `pwp_consent` (version, 365 d), SSR-readable; SDK init opt-out-by-default with memory persistence; grant → opt in + persistence switch + replay start; revoke → opt out + reset + clear
- [x] 2.2 `components/consent/consent-banner.tsx` mounted in the locale layout (hidden when a current-version choice exists or no key); consent control on `/privacy`; "Privacy" item in the user menu
- [x] 2.3 `app/[locale]/privacy/page.tsx` with localized content (what, who, where, why, how to change, server-side counting note); links from the banner and auth footers
- [x] 2.4 i18n namespaces `consent`, `privacy` ×5; catalog-drift test passes
- [x] 2.5 Tests: banner renders only without a choice; decline → no SDK init; grant → init and pageview; revoke clears identity

## 3. Analytics events and identity

- [x] 3.1 Web: `identify(user.id, { role, locale, internal })` in the provider when consent is granted; `reset()` on logout; email set only from the support panel
- [x] 3.2 Web funnel events in catalog, coach page, booking panel (slot), checkout, session room (joined), confirmation, cancel and dispute actions; `data-ph-mask` on dispute text, player "about" (editor + card), admin layout root
- [x] 3.3 API lifecycle events from `SettlementService` (paid, completed/released, refunded), `BookingsService.cancel`, `DisputesService` (submitted, resolved) with `{ serviceType, amountMinor, currency, sessionId }`, `$process_person_profile: false`
- [x] 3.4 Replay config: mask all inputs, `maskTextSelector`, sample rate + minimum duration from env, `before_send` URL scrub (`code`, `token`, `access_token`, `X-Amz-*`), `maskCapturedNetworkRequestFn`
- [x] 3.5 Tests: URL scrubber; API events emitted on settlement paths (unit) and once per transition (e2e with the no-op spy)

## 4. Error reporting and source maps

- [x] 4.1 Web: `app/[locale]/error.tsx` (localized, "Contact support" with error id), `app/global-error.tsx` (English fallback), `instrumentation.ts` with `register()` (nodejs runtime guard) and `onRequestError`
- [x] 4.2 API: `ObservabilityExceptionFilter` via `APP_FILTER` (non-HTTP or ≥ 500 only; route/method/status/userId); gateway catch blocks report through `ERROR_REPORTER`
- [x] 4.3 Dockerfiles: `APP_RELEASE` build arg (web → `NEXT_PUBLIC_APP_RELEASE`, api → env + label); `@posthog/cli sourcemap inject` + `upload` with `--mount=type=secret,id=posthog_cli_token`, skipped when absent; build recipe/`deploy.sh` docs pass the SHA and the secret
- [x] 4.4 Tests: filter reports 500 and not 400 (unit); error boundary renders and reports (vitest); a forced `/health?boom=1`-style dev-only route is NOT added — verification uses a temporary throw during staging checks

## 5. Feature flags

- [x] 5.1 Web server: `getAllFlags` with local evaluation (personal key, 30 s poll, 300 ms timeout fallback to defaults) in the locale layout; bootstrap into the client; `useFlag(name, default)` hook with `onFeatureFlags` updates
- [x] 5.2 API: `FeatureFlags.isEnabled(name, userId)` on the shared client; one internal flag `add-product-observability-support-panel` guarding the support entry points
- [x] 5.3 Document the naming/lifetime convention in `openspec/project.md` conventions; tests: no-token defaults, bootstrap round trip

## 6. Support channel

- [x] 6.1 API `GET /support/identity` (auth required) → `{ userId, hash }` HMAC-SHA256 with `POSTHOG_SUPPORT_SECRET`; 404 when unset; unit test for the hash
- [x] 6.2 `lib/observability/support.ts` over the conversations API (identify with hash, start, send, list; poll 10 s while open) — decision 9 gate: JS API confirmed in 1.1, own UI shipped, no widget fallback
- [x] 6.3 `components/support/support-panel.tsx` (drawer, composer, message list, anonymous email field) + entry points: user menu, `error.tsx`, checkout failed-payment state, session room connection-failure state, dispute form; hidden without a key or when the flag is off
- [x] 6.4 i18n namespaces `support`, `errors` ×5; tests: panel opens with context, polls only while open, hidden without key
- [x] 6.5 README: support email channel steps (MX/forward to the PostHog inbox, single merged SPF for Brevo + PostHog, PostHog DKIM + domain verification, keep DMARC `p=none` then tighten)

## 7. Infra, docs and verification

- [x] 7.1 `infra/k8s/env.example` observability block (all optional, silent defaults); `infra/posthog/dashboard.json` (funnel, sessions by service, error rate by release) + import instructions; README section: EU project, internal-user filter, replay defaults, usage alerts at 50 %, billing limits at launch
- [x] 7.2 Lint, tsc, api unit + e2e, web vitest green with no keys set; `grep` for direct `posthog` imports outside `observability` folders returns nothing — 2026-09-16: api jest 368/368, api e2e 86/86 (local e2e DB recipe), web vitest 174/174, root lint + typecheck green, `next build` green
- [ ] 7.3 Production verification checklist (issue #2): decline → zero `/ph` requests; accept → capture; forced web + API errors readable with the right release; full test booking in the funnel incl. API paid/completed; masked replay without tokens/signatures; flag toggle without redeploy; support round trip in two locales with replay attached; email round trip passing SPF/DKIM/DMARC; dev/CI silent; usage after a week within allowances
- [ ] 7.4 Roadmap line 24 in `openspec/project.md` updated (done 2026-09-16, marked 🛠️ implemented); archive after the production verification in 7.3
