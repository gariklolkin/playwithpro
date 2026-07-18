# Change: update-signup-timezone

## Why

Every account currently starts with `timezone = "UTC"`, and fixing it in settings means scrolling a dropdown of ~400 IANA zones. Sessions and availability (upcoming changes) render times in the viewer's timezone, so a wrong default becomes a real scheduling hazard.

## What Changes

- **Signup captures the browser timezone:** register and Google OAuth completion send `Intl.DateTimeFormat().resolvedOptions().timeZone`; the API validates it (IANA) and stores it, falling back to UTC when absent/invalid.
- **Searchable timezone picker:** the settings dropdown becomes a text input with native typeahead (datalist) over the supported zone list; a value outside the list is rejected client-side with an inline error.

## Impact

- Affected specs: `user-accounts` (ADDED requirement)
- Affected code: `packages/shared` (auth request types), `apps/api` (RegisterDto, OAuthCompleteDto, user creation in auth/oauth services), `apps/web` (register card, OAuth complete page, settings timezone field, catalogs ×5)
- Non-goals: rendering times per timezone (comes with availability/booking), changing existing accounts' stored UTC
