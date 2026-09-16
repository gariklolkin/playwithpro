## Context

Web is Next.js App Router (standalone image, `NEXT_PUBLIC_*` baked at build), API is NestJS with `ConfigModule` + class-validator env validation and a `@Throttle`d global guard. Provider abstractions already exist as injection tokens (`PAYMENT_PROVIDER`, `VIDEO_PROVIDER`, `CALENDAR_PROVIDER`) with dev fakes selected by configuration. There is no error boundary, no `instrumentation.ts`, no global exception filter, no footer, and the locale layout already loads the current user server-side (`getCurrentUser`). Images are tagged with the git SHA (`__TAG__` in the manifests, `deploy.sh <sha>`). The web UI sits behind Traefik basic auth; the API and LiveKit hosts do not. `support@play-with.pro` has no MX record; transactional mail goes through Brevo with SPF/DKIM already set for it.

Constraints: PostHog Cloud EU, one free-tier project (production only); dev and CI must stay silent; five locales; no business module may import the SDK; nothing may block a later OpenTelemetry rollout for logs/metrics/traces.

## Goals / Non-Goals

**Goals:**
- Errors from web and API visible within minutes with readable stacks and the deploy SHA.
- A measurable booking funnel with money events from the API as truth.
- Consent-gated client capture that is legally safe for EU visitors from day one.
- A kill switch that works without a redeploy, on both web and API.
- One localized support entry point wherever users hit trouble.
- $0 until launch: stay within every free allowance by design (sampling, dedupe, filters).

**Non-Goals:** logs/metrics/tracing; surveys; uptime alerting; separate dev project; AI replies; removing the gate; per-user analytics opt-out UI beyond the consent choice.

## Decisions

1. **One `observability` module per app, three interfaces, two implementations.**
   API: `apps/api/src/observability/` exports tokens `ANALYTICS`, `ERROR_REPORTER`, `FEATURE_FLAGS`; `PosthogProvider` implements all three over a single `posthog-node` client (flushed on shutdown), `NoopProvider` when `POSTHOG_API_KEY` is unset. The module is `@Global()` like `PrismaModule`. Web: `apps/web/lib/observability/{analytics,errors,flags,consent}.ts` wrap `posthog-js` behind the same interface names, with a no-op path when `NEXT_PUBLIC_POSTHOG_KEY` is empty. *Alternative rejected:* calling `posthog` directly from components/services — cheap now, but it binds business logic to the vendor, which the project conventions forbid and which would make the OpenTelemetry step a rewrite.

2. **Same-origin proxy via Next.js rewrites.** `next.config.ts` adds `rewrites()` mapping `/ph/static/:path*` → `https://eu-assets.i.posthog.com/static/:path*` and `/ph/:path*` → `https://eu.i.posthog.com/:path*`, with `skipTrailingSlashRedirect: true`. `posthog-js` is initialised with `api_host: "/ph"` and `ui_host: "https://eu.posthog.com"`. The rewrite is inert without a key because the SDK is never loaded. *Alternative rejected:* a Traefik-level path route — works, but keeps the proxy config out of the app repo where the SDK expects it and adds a middleware to the gated Ingress.

3. **Consent: a first-party cookie, opt-out-by-default SDK init.** `pwp_consent=<version>:granted|denied`, 365 days, `SameSite=Lax`, readable by SSR so the layout can render the banner (or not) without a flash. The SDK initialises with `opt_out_capturing_by_default: true`, `persistence: "memory"`, `disable_session_recording: true`; on grant we call `opt_in_capturing()`, switch persistence to `localStorage+cookie`, and start replay. On revoke: `opt_out_capturing()`, `reset()`, persistence cleared. Consent text carries a `CONSENT_VERSION` constant; a bump re-asks. The banner is a client component mounted in the locale layout; it links to `/privacy`. Signed-in users also reach `/privacy` from the user menu. *Alternative rejected:* a consent-management SaaS — another vendor and a non-localized UI for two buttons.

4. **Server-side lifecycle events do not depend on the cookie.** The API emits `session_paid`, `session_completed`, `session_refunded`, `session_disputed`, `dispute_resolved`, `session_cancelled` keyed by the acting user id with `{ serviceType, amountMinor, currency, sessionId }` and nothing free-text. Rationale: these mirror transactional records the platform already holds and processes to perform the contract; they contain no browser-derived tracking. The privacy page states this explicitly ("we count bookings and payments on our servers regardless of your cookie choice"). Web funnel events (`catalog_viewed`, `coach_viewed`, `slot_selected`, `checkout_viewed`, `room_joined`, `session_confirmed`, `dispute_submitted`, `booking_cancelled`) are consent-gated by construction. Person profiles for server events use `$process_person_profile: false` unless the user has been identified from the browser, so a declined user does not gain a profile from the server side. *Owner may reconsider this split after legal review; the design isolates it to one method (`Analytics.track` on the API) so tightening it later is a one-line change.*

5. **Identity.** Web: on every locale-layout render with a user and granted consent, `identify(user.id, { role, locale, internal })` where `internal` is true for `admin` role and for emails under the dev-fixture domain; `reset()` on logout in the user menu. The email is set (`$set: { email }`) only inside the support panel when it opens. PostHog's "filter internal users" is configured on the `internal` property (operator step).

6. **Error reporting.**
   - Web client: `posthog-js` exception autocapture on, plus explicit `captureException` in `app/[locale]/error.tsx` (locale-aware, renders a localized screen with "Contact support" that opens the panel with the error id) and `app/global-error.tsx` (root layout failure; English fallback strings because the intl provider may be gone).
   - Web server: `instrumentation.ts` exporting `register()` (starts `posthog-node` when `POSTHOG_KEY` is set, Node runtime only) and `onRequestError` → `captureException` with route/method, no user identity.
   - API: `ObservabilityExceptionFilter` registered via `APP_FILTER`: reports when the exception is not an `HttpException` or its status is ≥ 500, with `{ route, method, status, userId }`; then delegates to the default behaviour so responses are unchanged. WebSocket gateway errors go through the same reporter from the gateway's catch blocks.
   - Dedup/rate limit: `fingerprint = sha1(name + message + top frame)`, a `Map<fingerprint, { count, firstAt }>` per process, one report per fingerprint per 60 s carrying `count`, and a hard cap of 30 reports/min/process; both reporters share the algorithm (web version in `lib/observability/errors.ts`).

7. **Source maps and release.** `APP_RELEASE` build arg (= deploy SHA) is baked as `NEXT_PUBLIC_APP_RELEASE` (web) and `APP_RELEASE` env (API image label + env). In `Dockerfile.prod` build stage, after `next build` / `nest build`: `npx @posthog/cli sourcemap inject --directory <out>` then `sourcemap upload` using `RUN --mount=type=secret,id=posthog_cli_token`; the step is skipped when the secret is absent so local image builds still work. `deploy.sh`/the build recipe pass `--build-arg APP_RELEASE=$TAG --secret id=posthog_cli_token,src=~/.playwithpro-posthog-cli`. *Alternative rejected:* uploading from the operator machine after the build — an easy step to forget; the image build is the one place that always runs.

8. **Feature flags.** Web server: in the locale layout, `flags = await getAllFlags(distinctId, { personProperties: { role } })` via `posthog-node` (local evaluation with `POSTHOG_PERSONAL_API_KEY`, 30 s poll) and pass `bootstrap: { distinctID, featureFlags }` to the client init through a small `ObservabilityProvider` client component; `useFlag(name, default)` reads the bootstrapped value and subscribes to `onFeatureFlags` for updates. Anonymous `distinctID` comes from the SDK cookie when consent exists, otherwise a per-request random id (flags still work; no persistence). API: `FeatureFlags.isEnabled(name, userId)` on the same local-evaluation client. First consumer: a `session-recording` kill switch is *not* introduced here; the change ships the mechanism plus one internal flag `add-product-observability-support-panel` guarding the panel entry points so support can be switched off if the inbox misbehaves.

9. **Support panel.** `components/support/support-panel.tsx` (drawer, our UI): message list, composer, localized copy; backed by `lib/observability/support.ts`, which wraps PostHog's conversations JavaScript API (identify with the HMAC, start conversation, send message, list messages) and polls every 10 s only while open. Identity: `GET /support/identity` on the API returns `{ userId, hash }` with `hash = HMAC-SHA256(POSTHOG_SUPPORT_SECRET, userId)`; the secret never reaches the browser. Entry points pass a context object (`{ kind: "error" | "payment" | "room" | "dispute" | "menu", errorId?, sessionId? }`) that becomes the first message's metadata. The exact conversations method names are confirmed against the SDK version pinned in task 1.1; if the JS API turns out unavailable on the free plan, the fallback is the vendor widget with `disable_default_launcher` and our launcher button — same entry points, English widget, recorded in tasks as the decision gate.

10. **Replay controls.** `session_recording: { maskAllInputs: true, maskTextSelector: "[data-ph-mask]", sampleRate: NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE ?? 0.5, minimumDurationMilliseconds: 5000, recordCrossOriginIframes: false }`; `before_send` strips `code`, `token`, `X-Amz-*` query params and LiveKit `access_token` from `$current_url`/`$pathname`; `maskCapturedNetworkRequestFn` applies the same scrub to request URLs and drops bodies. `data-ph-mask` goes on the dispute textarea and rendered reason, the player "about" field and card, and the admin console layout root.

11. **Dashboard and alerts are operator steps, scripted where possible.** A `infra/posthog/` folder holds the funnel/dashboard definition as JSON (importable via the API) and the README lists: EU project creation, internal-user filter, replay masking defaults, usage alerts at 50 %, billing limits at launch, support email channel DNS (MX/forward → PostHog inbox, single merged SPF including Brevo + PostHog, PostHog DKIM, keep DMARC `p=none` until mail flows).

## Risks / Trade-offs

- [Free allowances exceeded by replay or error loops] → sampling + minimum duration, dedupe + per-process cap, 50 % usage alerts, internal accounts filtered.
- [Ad-blockers block `/ph` heuristically] → first-party path with a neutral name; accepted residual loss.
- [Consent banner hurts the gated testing period] → testers are told to accept; the banner is one line with two buttons and never blocks content.
- [Conversations JS API differs from the issue's assumption] → decision gate in tasks 5.1 with the documented widget fallback; the abstraction hides which one is used.
- [`instrumentation.ts` runs in the Edge runtime for middleware] → guard on `process.env.NEXT_RUNTIME === "nodejs"`.
- [Server flag evaluation adds latency to every render] → local evaluation with a 30 s cache; a cold start without the personal key falls back to the remote `getAllFlags` once per request with a 300 ms timeout and code defaults on failure.
- [Basic-auth gate blocks the ingestion proxy for the operator's own scripts] → ingestion is browser-originated behind the same gate; nothing else needs `/ph`.

## Migration Plan

1. Merge and deploy web + API with all `POSTHOG_*` unset — behaviour identical to today (no-op providers; banner hidden because no key).
2. Operator creates the EU project, fills `~/.playwithpro-prod.env` (`POSTHOG_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_SUPPORT_SECRET`, `NEXT_PUBLIC_POSTHOG_KEY`, replay sample), runs `apply-secrets.sh`, rebuilds web with the new build args and the CLI token secret, deploys.
3. Operator applies the project settings and imports the dashboard; runs the verification checklist from the issue (decline → zero requests; forced web/API errors with readable stacks; full test booking in the funnel; masked replay; flag toggle; support round trip in two locales; email round trip; dev/CI silent; usage after a week).
4. Rollback: unset the keys and redeploy, or redeploy the previous images; no data migration involved.

## Open Questions

- Server-side lifecycle events without cookie consent (decision 4): confirmed as the working assumption; owner to revisit after a legal read of the privacy page.
- Whether the conversations JS API is available on the free plan at implementation time (decision 9 gate).
