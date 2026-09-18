## 1. Registry, content, data model

- [x] 1.1 `packages/shared/src/legal/registry.ts` (documents, versions, draft, authoritative locale, helpers) + enums/types (`LegalDocument`, `LegalAcceptanceContext`, `LegalStatusResponse`, `AcceptLegalRequest`, `PlatformFacts`, `LegalAcceptanceEntry`); `RegisterRequest`/`OAuthCompleteRequest`/`PaySessionRequest`/`SubmitVerificationRequest` extended; `AdminUserDetail.legalAcceptances`
- [x] 1.2 Prisma `LegalAcceptance` + `LegalAcceptanceContext`, `NotificationKind.LEGAL_UPDATE_NOTICE`; migration `add_legal_acceptance`
- [x] 1.3 Placeholder documents ×5 locales for version `2026-09-18` of all five documents under `apps/web/content/legal/` (structured headings per the issue, `{{tokens}}` for every number); privacy includes the tracking/cookie section
- [x] 1.4 Env: `OPERATOR_NAME`, `OPERATOR_ADDRESS` (imprint facts); env examples

## 2. API

- [x] 2.1 `LegalModule`: `LegalService` (`record`, `status`, `assertCurrent`), `GET /legal/status`, `POST /legal/accept`, public `GET /platform-facts`; unit tests
- [x] 2.2 `LegalGuard` with `legal_reacceptance_required` on `POST /bookings`, `POST /sessions/:id/pay`, `POST /pros/me/verification`, availability mutations; unit tests
- [x] 2.3 Registration + OAuth completion: `acceptedTerms`, `acceptedPrivacy`, `locale`; `legal_version_outdated`; rows in the user's transaction; unit tests
- [x] 2.4 Verification submission: `coachAgreementVersion`; checkout: `bookingPolicyVersion` + `CHECKOUT` row; unit tests
- [x] 2.5 `LegalNoticeService` (hourly, guarded) + `LEGAL_UPDATE_NOTICE` catalogs ×5 + dispatcher stale rule; email footer in the renderer wrapper ×5 (notice service covered by the e2e flows and the dispatcher's existing tests; no dedicated unit spec)
- [x] 2.6 Admin user detail: `legalAcceptances`
- [x] 2.7 e2e helper: accept current documents for suite users; e2e: register with/without versions and locale, OAuth completion, verification submit, checkout row, gate with a stale user (409 on book/pay, room still readable), accept clears it, admin history

## 3. Web

- [x] 3.1 Markdown subset renderer + `content/legal` loader; `/legal/[document]/[[...version]]` pages with version, date, draft marker, convenience note, tokens from `/platform-facts`; `/privacy` redirect; consent control on the privacy page; completeness vitest
- [x] 3.2 `SiteFooter` in the locale layout (compact in the room); landing footer replaced
- [x] 3.3 Register card + OAuth completion checkbox (links, professional → coach agreement link), versions + locale sent, outdated handling; vitest
- [x] 3.4 Verification card checkbox; checkout policy summary + link + version sent; vitest
- [x] 3.5 `LegalGate`: interstitial (material) and banner (minor, dismissible per version); vitest
- [x] 3.6 Upload notice, dispute-form and review-form links; admin user detail history; catalogs ×5; drift test

## 4. Verification

- [x] 4.1 Lint, tsc, api unit + e2e, web vitest green; browser smoke: register with the checkbox (de), legal page with version, footer, interstitial after a registry bump (local)
- [ ] 4.2 Roadmap entry 30; staging verification, then archive
