# Design: add-i18n

## Context

next-intl v4 is already installed and bootstrapped single-locale (`i18n/request.ts` hard-codes `en`). `packages/shared` exports `Locale`, `DEFAULT_LOCALE`, `SUPPORTED_LOCALES` — those stay the single source of truth. The web app is Next 16 (App Router, async `params`).

## Decisions

### 1. Prefix strategy: `as-needed`

`en` (default) renders at `/`, `/login`, …; other locales get a prefix (`/ru/login`).

- Existing bookmarks, OAuth redirect URIs, mailer links and `scripts/e2e-auth.sh` keep working unchanged.
- Alternative (`always`) would 308-redirect `/` → `/en` and require touching Google OAuth console + email templates for zero benefit at this stage.

### 2. Routing module layout

```
apps/web/i18n/
  routing.ts      defineRouting({ locales: SUPPORTED_LOCALES, defaultLocale: DEFAULT_LOCALE, localePrefix: "as-needed" })
  navigation.ts   createNavigation(routing) → { Link, redirect, usePathname, useRouter }
  request.ts      getRequestConfig using requestLocale + hasLocale fallback
  locale-labels.ts endonym labels (English / Français / Deutsch / Русский / 中文) — shared by switcher & settings
```

All internal navigation (links, `router.push`, server `redirect`) switches from `next/link` / `next/navigation` to the `@/i18n/navigation` wrappers so locale prefixes are applied automatically. Pathnames stay un-translated (`/ru/login`, not `/ru/vhod`).

### 3. Middleware composition

One `middleware.ts` doing auth first, then i18n:

1. Strip a supported-locale prefix from the pathname; if the remainder is protected (`/dashboard`, `/settings`) and no `access_token` cookie → redirect to `/<locale>/login?next=<original pathname>` (prefix preserved).
2. Otherwise delegate to `createMiddleware(routing)` for locale detection/rewrite/redirect and `NEXT_LOCALE` cookie maintenance.

Matcher widens from the two protected segments to all pages: `"/((?!api|_next|.*\\..*).*)"` — the intl middleware must see every page request.

### 4. `app/[locale]/` layout

Everything under `app/` moves to `app/[locale]/`. The `[locale]` layout owns `<html lang={locale}>`/`<body>` (no separate root layout — standard next-intl setup), validates the param with `hasLocale` (else `notFound()`), and provides messages. Metadata moves to `generateMetadata` reading the `meta` namespace.

### 5. Language switcher

Client component replacing the decorative `<select>` in the navbar:

- `router.replace(pathname, { locale })` from `@/i18n/navigation` — stays on the current page; next-intl sets the `NEXT_LOCALE` cookie on the resulting request.
- If a user is logged in (navbar already knows), fire-and-forget `PATCH /users/me { locale }` so the preference follows them across devices. Failures are ignored — the cookie/URL already switched.
- Settings "Interface language" save additionally navigates to the new locale so the change is visible immediately.

The stored profile `locale` is **not** used to force-redirect on login — URL + cookie win; the profile value is a synced preference (it becomes authoritative for emails later).

### 6. Catalogs

`messages/{en,fr,de,ru,zh}.json`, identical key trees. New namespaces: `home` (hero, trust strip, steps, footer — rich-text tags for accents), `meta`. A vitest test walks all catalogs and asserts key-set equality against `en`, so a missing translation fails CI rather than falling back silently.

## Risks / Trade-offs

- **Machine-drafted translations** (fr/de/zh) — acceptable for MVP; owner reviews ru/en. Catalog parity test keeps structure honest either way.
- **Middleware ordering:** auth check runs on the un-rewritten URL; stripping the prefix manually duplicates a sliver of next-intl logic. Kept trivial (string prefix match against `SUPPORTED_LOCALES`).
- Emails remain English until a later change; `locale` is already stored per user for when that lands.
