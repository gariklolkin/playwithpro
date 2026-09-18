## ADDED Requirements

### Requirement: Account settings tab for data rights
The settings dialog SHALL have an Account tab with a "Download my data" card (request, status, download link) and a "Delete account" card that shows the blockers with links when there are any, otherwise explains what is deleted, what is kept and why, the grace period, asks for re-authentication and a typed confirmation word, and then submits the request. All strings SHALL come from the catalogs in all five locales.

#### Scenario: Blockers explained
- **WHEN** a coach with a booked session opens the delete card
- **THEN** the card lists the session with a link and offers no delete action

#### Scenario: Confirmation word
- **WHEN** the user has re-authenticated but not typed the confirmation word
- **THEN** the delete action stays disabled

### Requirement: Former member identity
Wherever a session party, review author, dispute party or ledger party is displayed and that user has been deleted, the UI SHALL show a localized "Former member" label and no avatar instead of a name, and SHALL never expose the tombstone email.

#### Scenario: Counterpart deleted
- **WHEN** a coach views a past session whose player was deleted
- **THEN** the entry shows "Former member" as the player
