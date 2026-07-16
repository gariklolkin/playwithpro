# i18n Specification

## Purpose
Serve the web app in five locales (en, fr, de, ru, zh) with URL-prefixed routing, negotiated and persisted locale choice, complete message catalogs, and a language switcher.

## Requirements

### Requirement: Locale-prefixed routing
The web app SHALL serve every page in the five supported locales (`en`, `fr`, `de`, `ru`, `zh`) via URL locale prefixes, with the default locale `en` served unprefixed.

#### Scenario: Prefixed locale
- **WHEN** a visitor opens `/ru/login`
- **THEN** the login page renders with Russian copy and `<html lang="ru">`

#### Scenario: Default locale unprefixed
- **WHEN** a visitor opens `/login` with no locale cookie or matching `Accept-Language`
- **THEN** the page renders in English at `/login` without a redirect to a prefixed URL

#### Scenario: Unknown locale prefix
- **WHEN** a visitor opens `/xx/login` where `xx` is not a supported locale
- **THEN** the app responds with a 404

### Requirement: Locale negotiation and persistence
The web app SHALL resolve the locale for un-prefixed requests from the `NEXT_LOCALE` cookie first, then the `Accept-Language` header, falling back to `en`, and SHALL persist the visitor's latest locale choice in the cookie.

#### Scenario: Returning visitor with cookie
- **WHEN** a visitor whose `NEXT_LOCALE` cookie is `de` opens `/`
- **THEN** they are served the German version of the page

#### Scenario: First visit with Accept-Language
- **WHEN** a new visitor with `Accept-Language: fr` opens `/`
- **THEN** they are served the French version of the page

### Requirement: Language switcher
The navbar SHALL offer a language switcher listing all supported locales by their native names; selecting one SHALL re-render the current page in that locale and update the locale cookie. For an authenticated user the choice SHALL also be saved to their profile `locale`.

#### Scenario: Guest switches locale
- **WHEN** a signed-out visitor on `/register` selects "Русский"
- **THEN** they stay on the registration page rendered in Russian at `/ru/register` and subsequent visits default to Russian

#### Scenario: Authenticated user switches locale
- **WHEN** a logged-in user selects "Deutsch" in the navbar
- **THEN** the page re-renders in German and the user's profile `locale` becomes `de`

### Requirement: Complete message catalogs
All user-facing UI copy SHALL come from next-intl message catalogs, and the `fr`, `de`, `ru`, `zh` catalogs SHALL contain exactly the same key set as `en`, enforced by an automated test.

#### Scenario: Catalog drift
- **WHEN** a key exists in `en.json` but is missing from any other catalog (or vice versa)
- **THEN** the web unit test suite fails

### Requirement: Locale-aware auth redirects
Redirects produced by the route-protection middleware SHALL preserve the visitor's locale.

#### Scenario: Protected page in a prefixed locale
- **WHEN** a signed-out visitor opens `/ru/dashboard`
- **THEN** they are redirected to `/ru/login` with the original destination preserved in the `next` parameter
