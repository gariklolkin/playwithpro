# Tasks: add-i18n

## 1. Routing infrastructure
- [x] 1.1 `i18n/routing.ts` (defineRouting from shared locale constants, `as-needed` prefix), `i18n/navigation.ts` (createNavigation), `i18n/request.ts` on `requestLocale`; `i18n/locale-labels.ts` endonyms
- [x] 1.2 Move all pages under `app/[locale]/`; locale-validating layout owns `<html lang>`; `generateMetadata` from `meta` namespace
- [x] 1.3 Middleware: auth guard (locale-aware login redirect) composed with next-intl middleware; widened matcher
- [x] 1.4 Switch internal links/redirects to `@/i18n/navigation` wrappers

## 2. Catalogs
- [x] 2.1 Externalize home page + metadata strings into `home`/`meta` namespaces (en)
- [x] 2.2 Full `fr`, `de`, `ru`, `zh` catalogs with key parity

## 3. Language switcher
- [x] 3.1 Functional navbar switcher (current page, cookie persistence; `PATCH /users/me` when authenticated)
- [x] 3.2 Settings "Interface language" save re-renders UI in the chosen locale

## 4. Verification & archive
- [x] 4.1 Tests: catalog key parity, locale-aware middleware redirects, switcher behavior; existing suites updated and green
- [x] 4.2 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; CI green
- [x] 4.3 STOP — request owner review before archiving; archive only after approval
