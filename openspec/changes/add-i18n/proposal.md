# Change: add-i18n

## Why

The platform serves players and coaches across language markets (en, fr, de, ru, zh). Auth landed with next-intl bootstrapped in `en` only; before catalog/profile/booking UI grows, locale routing and full message catalogs must be in place so every subsequent change ships translated from day one.

## What Changes

- **Locale routing:** URL-prefixed locales via next-intl routing (`/fr/...`, `/de/...`, `/ru/...`, `/zh/...`); default `en` stays unprefixed (`as-needed` strategy) so all existing links, OAuth redirect URIs and e2e scripts keep working. All pages move under `app/[locale]/`; unknown locale prefixes 404.
- **Locale negotiation:** first visit honors `NEXT_LOCALE` cookie, then `Accept-Language`; the cookie is updated on every locale switch.
- **Message catalogs:** full `fr`, `de`, `ru`, `zh` catalogs mirroring `en`; remaining hard-coded strings (home page, metadata) externalized. A unit test enforces key parity across all five catalogs.
- **Language switcher:** the static navbar `<select>` becomes functional — switches the current page to the chosen locale; for an authenticated user it also persists `locale` to the profile (`PATCH /users/me`). Changing "Interface language" in account settings re-renders the UI in the new locale.
- **Localized chrome:** `<html lang>`, page metadata (title/description) per locale.

**New capability spec:** `i18n`

## Impact

- Affected specs: `i18n` (new)
- Affected code: `apps/web` only — `i18n/` (routing, navigation, request), `middleware.ts` (compose next-intl with auth guard), `app/` → `app/[locale]/` move, `messages/*.json` (4 new catalogs + home/meta namespaces), navbar locale switcher, tests
- Non-goals: translating transactional emails (English for now, per `add-auth-and-accounts`), locale-specific number/date formatting policies (comes with booking), RTL support
