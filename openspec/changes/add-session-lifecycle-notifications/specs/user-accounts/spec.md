## MODIFIED Requirements

### Requirement: Account settings dialog
Account settings SHALL open as a modal dialog over the page the signed-in user is currently on, with three tabs — **Profile** (photo, display name, interface language, timezone), **Security** (password, connected Google account) and **Notifications** (email preferences) — instead of navigating to a separate page. The dialog SHALL be addressable through the `settings` search parameter (`profile` | `security` | `notifications`; any other value resolves to `profile`) on any signed-in page, SHALL be opened from the user menu "Settings" item and the dashboard sidebar "Settings" item, and SHALL close (removing only that parameter from the URL, keeping the page and its other parameters) via the close button, the Escape key, or clicking the backdrop. Below 640px the dialog SHALL be presented full-screen. The avatar crop step SHALL open as a nested dialog above the settings dialog and return focus to it when dismissed.

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

#### Scenario: Notifications tab
- **WHEN** the user opens `/dashboard?settings=notifications`
- **THEN** the dialog opens on the Notifications tab showing the three email toggles

## ADDED Requirements

### Requirement: Email notification preferences
Each account SHALL carry three email preferences — session reminders, clip changes (coaches), review received (coaches) — on by default, readable and updatable by the account owner through the API and the settings dialog's Notifications tab, and changeable without signing in through the signed one-click unsubscribe link of the corresponding email. Transactional emails SHALL NOT be switchable.

#### Scenario: Turn reminders off
- **WHEN** a user switches reminders off in the Notifications tab
- **THEN** the preference is persisted and no further reminder is sent to that account

#### Scenario: Unsubscribe link without a session
- **WHEN** a signed-out recipient opens the unsubscribe link from a review-received email
- **THEN** the review-received preference is turned off for that account and the page confirms it
