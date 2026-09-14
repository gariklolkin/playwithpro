## ADDED Requirements

### Requirement: Account settings dialog
Account settings SHALL open as a modal dialog over the page the signed-in user is currently on, with two tabs — **Profile** (photo, display name, interface language, timezone) and **Security** (password, connected Google account) — instead of navigating to a separate page. The dialog SHALL be addressable through the `settings` search parameter (`profile` | `security`; any other value resolves to `profile`) on any signed-in page, SHALL be opened from the user menu "Settings" item and the dashboard sidebar "Settings" item, and SHALL close (removing only that parameter from the URL, keeping the page and its other parameters) via the close button, the Escape key, or clicking the backdrop. Below 640px the dialog SHALL be presented full-screen. The avatar crop step SHALL open as a nested dialog above the settings dialog and return focus to it when dismissed.

#### Scenario: Open from the user menu on a public page
- **WHEN** a signed-in user on `/coaches` chooses "Settings" in the user menu
- **THEN** the URL becomes `/coaches?settings=profile`, the settings dialog opens on the Profile tab over the catalog, and the catalog stays rendered underneath

#### Scenario: Close returns to the page
- **WHEN** the user presses Escape (or the close button, or the backdrop) while `/dashboard/sessions?settings=security` is open
- **THEN** the dialog closes and the URL becomes `/dashboard/sessions` without a page navigation or scroll reset

#### Scenario: Reload keeps the dialog
- **WHEN** the user reloads `/dashboard?settings=security`
- **THEN** the dialog opens on the Security tab

#### Scenario: Interface language changed inside the dialog
- **WHEN** the user saves a different interface language on the Profile tab while on `/dashboard?settings=profile`
- **THEN** the page underneath re-renders at the new locale prefix and the dialog stays open on the Profile tab, translated

#### Scenario: Nested crop dialog
- **WHEN** the user picks an image on the Profile tab
- **THEN** the crop dialog opens above the settings dialog covering the viewport, and cancelling it returns keyboard focus to the settings dialog

#### Scenario: Signed-out visitor with the parameter
- **WHEN** a signed-out visitor opens `/coaches?settings=profile`
- **THEN** the catalog renders normally and no dialog is shown

## MODIFIED Requirements

### Requirement: Protected web areas
The web app SHALL redirect unauthenticated visitors from `/dashboard` and `/settings` to `/login`, preserving the intended destination, and SHALL render the dashboard shell appropriate to the user's role. `/settings/account` SHALL NOT render a standalone page: for a signed-in user it SHALL redirect to `/dashboard?settings=profile` (or `?settings=security` when the request carries `?tab=security`), preserving the locale, so that existing links, bookmarks and post-login returns open the account settings dialog over the dashboard.

#### Scenario: Deep link while signed out
- **WHEN** a signed-out visitor opens `/settings/account`
- **THEN** they are redirected to `/login` and, after signing in, land on `/dashboard?settings=profile` with the settings dialog open

#### Scenario: Legacy settings URL while signed in
- **WHEN** a signed-in user opens `/de/settings/account?tab=security`
- **THEN** they are redirected to `/de/dashboard?settings=security`
