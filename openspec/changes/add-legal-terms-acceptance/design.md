## Context

No legal pages, no acceptance, no footer. `add-product-observability` shipped a minimal `/privacy` page (tracking, consent control) that the consent banner links to. Users are created in `AuthService.register` and `OAuthService.completeSignup`; coaches submit for verification with an empty `POST /pros/me/verification`; checkout pays with `POST /sessions/:id/pay`. Emails are rendered by `EmailRenderer` (API catalogs ×5) with a common wrapper. All e2e suites create users directly through Prisma.

## Goals / Non-Goals

**Goals:** one registry of documents and versions; every acceptance a dated, versioned, append-only row with its context; the texts readable at every version in every locale; a gate that blocks commitment actions (never the room) after a material change; the footer everywhere; placeholders structured for counsel.

**Non-Goals:** writing the legal text; deciding the counsel questions (marketplace role, withdrawal right, age limit, evidence fields) — each has a documented default that can change without a schema change.

## Decisions

### D1. Registry as code, content as files
`packages/shared/src/legal/registry.ts` exports `LEGAL_DOCUMENTS: Record<LegalDocument, { versions: LegalVersion[]; draft: boolean; authoritativeLocale: Locale }>` with `LegalVersion = { version: 'YYYY-MM-DD', effectiveAt, material }`, plus `currentVersion(doc)` and `latestMaterialVersion(doc)`. Publishing a version is a code change (new Markdown files + a registry entry) reviewed like any other; nothing in the database describes the documents. Content lives in `apps/web/content/legal/<doc>/<version>/<locale>.md` and is read at build/request time on the server (`fs`, cached). A vitest test walks the registry and asserts every `(version, locale)` file exists — the CI completeness check.

### D2. A restricted Markdown subset, rendered by ~60 lines
Headings (`#`–`###`), paragraphs, `-` lists, `**bold**`, links and `{{token}}` placeholders. No dependency: the documents are ours, the subset is enforced by the completeness test (unknown syntax fails it), and a full Markdown engine would widen the attack surface for content that is, after all, rendered as HTML. Tokens are replaced with values from `GET /platform-facts` (`feePercent`, cancellation tiers, `autoConfirmHours`, `unattachedVideoRetentionDays`, `noShowResponseHours`, `supportEmail`, `operatorName`), so no number is ever hard-coded in a text.

### D3. Acceptance rows are the only evidence — and the only gate input
`LegalAcceptance(userId, document, version, locale, context, sessionId?, acceptedAt)`; append-only by convention (no update/delete path in product code), indexed `(userId, document, acceptedAt)`. "Current" for a user is their latest row per document. The gate: `stale(user) = documents required for the user's role whose latest accepted version < latestMaterialVersion(doc)` — with *no row at all counting as stale*. Required documents: `terms` for everyone, `coach-agreement` for professionals (only once they have submitted for verification; before that, the submission itself asks). Consequence: users created outside the sign-up flow (seeds, e2e) must accept explicitly — the suites get a two-line helper. There is no backfill: fabricated acceptance is not evidence.

### D4. Where the gate bites
`LegalGuard` (Nest guard, after auth) on `POST /bookings`, `POST /sessions/:id/pay`, `POST /pros/me/verification` (terms only — the agreement is in the body), `PUT/POST/DELETE pros/me/availability*`. It answers `409 { code: 'legal_reacceptance_required', documents: [{ document, version }] }`. Reads, the room, confirmation, disputes, reviews and cancellations are never gated: a terms update must not trap money or attendance. The web `LegalGate` (client, in the locale layout) reads `GET /legal/status` for a signed-in user and renders the interstitial over everything except `/legal/*` and `/sessions/*/room`; a non-material newer version renders a dismissible banner (dismissal in `localStorage`, per version).

### D5. Sign-up carries the versions it showed
`RegisterDto`/`OAuthCompleteDto` gain `acceptedTerms`, `acceptedPrivacy` (version strings) and `locale`. The API compares them with `currentVersion(...)`; a mismatch is `400 { code: 'legal_version_outdated' }` so a stale tab re-renders with the new links. The rows are written inside the same transaction as the user (`register` gets a transaction; `completeSignup` already has the user create). `locale` is validated against the routing locales and becomes `User.locale` — the visitor's language, not the `en` default.

### D6. Checkout acknowledgment without breaking payment
`PaySessionDto.bookingPolicyVersion?` — the web always sends the version it displayed; when present it must be current (`409 legal_version_outdated`), and paying records a `CHECKOUT` row with the session id. Optional at the DTO level so existing API clients and e2e pay calls keep working; the acknowledgment row is written with the *current* version either way, because the summary shown at checkout is always the current one.

### D7. Notices are a sweep, not a publish hook
Versions ship with deploys; there is no runtime "publish" event. `LegalNoticeService` (hourly, guarded) looks at documents with more than one version and enqueues `LEGAL_UPDATE_NOTICE` (transactional, `dedupeSuffix = <doc>:<version>`, `sessionId null`) for up to 200 users per tick whose latest acceptance is older than the current version. The email says whether re-acceptance is required (material) or it is a notice. The dispatcher's stale check skips the row once the user accepted.

### D8. Footer and email footer
`SiteFooter` (server component) in the locale layout, `compact` when the pathname is a room (decided client-side by a tiny wrapper reading `usePathname`). Emails: the renderer's common wrapper gains `common.legalFooter` (operator name, imprint and privacy links) rendered once for every email.

## Risks / Trade-offs

- [Interstitial blocks a user mid-task] → only after a material version; the room and reads stay open; one click to accept.
- [Placeholder texts go live] → the draft marker is on every page until the registry's `draft: false`; the basic-auth gate stays until counsel's texts are in.
- [Markdown subset too small for counsel] → headings, lists, bold, links cover legal prose; anything else is a deliberate renderer extension.
- [Per-locale authoritativeness] → `authoritativeLocale` in the registry; flipping it is a one-line change, the note text follows.

## Migration Plan

Additive migration. Existing users (staging only) hit the interstitial once — expected, and the e2e/seed helpers accept explicitly. Rollback: old code ignores the table; the web without the gate simply stops asking.

## Open Questions

Counsel's list from the issue (marketplace role, imprint content, withdrawal right, DSA/P2B, age, evidence fields, language, materiality) — each with the default implemented here: intermediary wording avoided in copy, 18+ self-declaration in the checkbox, user/version/time/locale as evidence, English authoritative, `material` decided per version in the registry.
