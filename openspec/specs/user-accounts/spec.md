# user-accounts Specification

## Purpose
Let a signed-in user manage their own account: profile basics (display name, locale, timezone), an avatar, password changes, and linked OAuth accounts.

## Requirements

### Requirement: Own profile access
The system SHALL let an authenticated user read and update their own account basics: display name, interface locale (en/fr/de/ru/zh), and IANA timezone.

#### Scenario: Update timezone
- **WHEN** a user changes their timezone in account settings
- **THEN** the value is persisted and subsequent time rendering uses it

### Requirement: Password change
The system SHALL allow changing the password only when the current password is provided correctly, and SHALL revoke all other sessions afterwards.

#### Scenario: Wrong current password
- **WHEN** the current password is incorrect
- **THEN** the change is rejected and no sessions are affected

### Requirement: Seeded admin account
The system SHALL provide a development seed that creates an admin user from environment variables; production admin provisioning is out of scope for this change.

#### Scenario: Seed run twice
- **WHEN** the seed script runs against a database that already has the admin
- **THEN** it is idempotent and does not create duplicates

### Requirement: Protected web areas
The web app SHALL redirect unauthenticated visitors from `/dashboard` and `/settings` to `/login`, preserving the intended destination, and SHALL render the dashboard shell appropriate to the user's role.

#### Scenario: Deep link while signed out
- **WHEN** a signed-out visitor opens `/settings/account`
- **THEN** they are redirected to `/login` and returned to `/settings/account` after signing in

### Requirement: Externalized UI strings
All user-facing strings introduced by this change SHALL live in next-intl message catalogs (English catalog for now), not in component code.

#### Scenario: Catalog completeness
- **WHEN** the web app builds
- **THEN** no auth/settings page contains hard-coded user-facing strings

### Requirement: Timezone capture at signup
Account creation (email registration and OAuth completion) SHALL accept an optional IANA timezone supplied by the client and store it on the user, defaulting to UTC when absent. Invalid timezone values SHALL be rejected with a validation error.

#### Scenario: Browser timezone stored at registration
- **WHEN** a visitor in Berlin registers and the browser reports `Europe/Berlin`
- **THEN** the created account has `timezone = "Europe/Berlin"` without any manual choice

#### Scenario: Missing timezone falls back to UTC
- **WHEN** a signup request arrives without a timezone
- **THEN** the account is created with `timezone = "UTC"`

### Requirement: Searchable timezone picker
The account settings timezone field SHALL support typeahead search over the supported IANA zones and SHALL not submit a value outside that list.

#### Scenario: Filter by typing
- **WHEN** the user types "berl" into the timezone field
- **THEN** `Europe/Berlin` is offered for selection

#### Scenario: Free-text garbage
- **WHEN** the user types a value that is not a supported zone and saves
- **THEN** an inline validation message is shown and no request is sent

### Requirement: Account avatar
The system SHALL let any authenticated user (amateur or professional) set a profile avatar via a pre-signed upload URL to S3-compatible storage, restricted to JPEG/PNG/WebP with a maximum size of 5 MB, and SHALL let them replace or remove it. The upload SHALL be a two-step flow: request a pre-signed URL, upload directly to storage, then confirm to attach the object to the account.

#### Scenario: Successful avatar upload
- **WHEN** a user requests an upload URL for a 1 MB PNG, uploads it, and confirms
- **THEN** the avatar is attached to the account and returned on subsequent reads

#### Scenario: Disallowed content type
- **WHEN** a user requests an upload URL for a `video/mp4` file
- **THEN** the request is rejected with a validation error and no URL is issued

#### Scenario: Remove avatar
- **WHEN** a user removes their avatar
- **THEN** subsequent reads return no avatar and the UI falls back to initials

### Requirement: Avatar in public identity
Wherever the system exposes a user's public identity (display name), it SHALL also expose the avatar URL when one is set; UI surfaces SHALL render an initials placeholder when it is not.

#### Scenario: Identity payload includes avatar
- **WHEN** an endpoint returns a user's display name to another authorized user
- **THEN** the payload includes the avatar URL or a null value, never a broken link

#### Scenario: No avatar set
- **WHEN** a user without an avatar appears in any UI surface
- **THEN** an initials placeholder is rendered
