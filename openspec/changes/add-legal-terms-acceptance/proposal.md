## Why

The platform takes players' money, charges coaches a fee and stores videos of people, yet nobody has agreed to anything: there are no terms, no privacy policy beyond the tracking note, no imprint, no acceptance at sign-up, no coach agreement, and no policy at checkout. Real payments cannot start without dated, versioned evidence of what each user accepted. GitHub issue [#7](https://github.com/gariklolkin/playwithpro/issues/7). The texts are structured placeholders for counsel; this change delivers the mechanism.

## What Changes

- **Document registry** in `packages/shared` — five documents (`terms`, `privacy`, `imprint`, `booking-policy`, `coach-agreement`) with versions (`version`, `effectiveAt`, `material`), a draft marker and the authoritative locale. Content and community guidelines are a section of the terms; the cookie policy is a section of the privacy policy. Web and API read the same source.
- **Versioned localized pages** `/legal/<document>` and `/legal/<document>/<version>` rendered from Markdown files `apps/web/content/legal/<document>/<version>/<locale>.md` (all five locales at every version, English authoritative with a convenience note), showing version, effective date and the draft marker. The privacy page from `add-product-observability` becomes the tracking/cookie section of the privacy policy plus the consent control; `/privacy` redirects to it. Numbers (fee, cancellation tiers, auto-confirm hours, retention days) come from a public `GET /platform-facts`, never from the text.
- **`LegalAcceptance` records**, append-only: user, document, version, locale, context (`REGISTRATION`, `OAUTH_COMPLETE`, `VERIFICATION_SUBMIT`, `CHECKOUT`, `REACCEPT`), optional session, time.
- **Acceptance points:** an unticked checkbox at email registration and Google sign-up completion (terms accepted, privacy read, age confirmed) whose versions travel in the request and are refused when missing or outdated, recorded in the user's transaction with the visitor's locale (which also becomes `User.locale`); a required coach-agreement checkbox before "Submit for verification"; a booking-policy summary with a link at checkout, paying records a `CHECKOUT` acknowledgment for the session.
- **Re-acceptance:** a version flagged material makes older acceptances stale. The web shows a blocking interstitial after sign-in (not on legal pages, never in the room); the API refuses booking, paying, verification submission and availability changes with the stable error `legal_reacceptance_required` until the current versions are accepted (`POST /legal/accept`). A non-material version shows a dismissible banner. A notice email goes out once per user and version when a newer version exists (`LEGAL_UPDATE_NOTICE`, outbox).
- **Placements:** a site footer on every page (compact in the room) with Terms, Privacy, Imprint, Booking policy, Coach agreement, Cookie settings and support; links on the upload page, dispute form, review form and the professional registration; an operator/imprint/privacy footer on every email.
- **Admin:** acceptance history on the user detail page.
- **CI check:** a web test fails when a registered version lacks a locale file.

Out of scope: the legal texts themselves (placeholders), the consent banner (#2), the cancellation rules (#6), deletion/export flows (#8), invoicing/VAT/Stripe, date-of-birth collection, localized email bodies beyond the existing catalogs, marketing opt-in, a notice-and-action tool. The "Service provided by {coach}" checkout line waits for counsel's answer on the marketplace role.

## Capabilities

### New Capabilities

- `legal-documents`: the registry, versioned localized pages, acceptance records, the re-acceptance gate and notices, the footer, platform facts.

### Modified Capabilities

- `auth`: terms/privacy acceptance required at registration and Google sign-up completion; the visitor's locale recorded.
- `pro-verification`: coach agreement required at submission.
- `booking`: booking-policy acknowledgment at checkout; the re-acceptance gate on booking and payment.
- `availability`: the re-acceptance gate on publishing changes.
- `video-library`: upload notice with a link to the content terms.
- `reviews`: review form links to the guidelines.
- `disputes`: dispute form links to the dispute rules.
- `admin-console`: acceptance history on the user detail.

## Impact

- **DB (migration `add_legal_acceptance`):** `LegalAcceptance` table + `LegalAcceptanceContext` enum; `NotificationKind.LEGAL_UPDATE_NOTICE`.
- **API:** `LegalModule` (`LegalService`, `LegalGuard`, `LegalController`: `GET /legal/status`, `POST /legal/accept`, `GET /platform-facts`; `LegalNoticeService` cron); `RegisterDto`/`OAuthCompleteDto` gain `acceptedTerms`, `acceptedPrivacy`, `locale`; `POST /pros/me/verification` gains `coachAgreementVersion`; `PaySessionDto` gains `bookingPolicyVersion`; guards on the four commitment routes; mailer wrapper footer; catalogs ×5.
- **Shared:** `legal/registry.ts`, `LegalDocument`, `LegalAcceptanceContext`, `LegalStatusResponse`, request types, `PlatformFacts`, `AdminUserDetail.legalAcceptances`.
- **Web:** `content/legal/**` (25 Markdown files), `/legal/[document]/[[...version]]`, `SiteFooter`, `LegalGate` (interstitial + banner), checkboxes on register/oauth/verification, checkout summary, upload/dispute/review links, admin history; a tiny Markdown renderer (no new dependency).
- **Tests:** e2e users must accept the current terms in the suites' setup (the gate is real).
