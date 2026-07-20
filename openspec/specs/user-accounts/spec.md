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
The system SHALL let any authenticated user (amateur or professional) set a profile avatar, and SHALL let them replace or remove it. The UI SHALL accept an image of any size in any format the browser can decode and SHALL open a crop dialog (square frame with zoom and pan); the cropped area is exported client-side to a normalized square image (512×512, WebP with JPEG fallback), which strips metadata and bakes in EXIF orientation. The normalized image SHALL be uploaded via the existing two-step flow: request a pre-signed URL (JPEG/PNG/WebP, maximum 5 MB — the server contract), upload directly to S3-compatible storage, then confirm to attach the object to the account. Server-side validation SHALL remain unchanged as defense in depth.

#### Scenario: Large desktop photo is cropped and uploaded
- **WHEN** a user picks a 30 MB 6000×4000 photo, adjusts the crop, and confirms
- **THEN** a 512×512 normalized image is uploaded and attached — the original size never hits the server limit

#### Scenario: Crop dialog controls framing
- **WHEN** the user zooms and pans inside the crop dialog before confirming
- **THEN** the uploaded avatar contains exactly the selected square area

#### Scenario: Undecodable file
- **WHEN** the user picks a file the browser cannot decode as an image
- **THEN** an inline error is shown and no upload starts

#### Scenario: Cancel keeps the current avatar
- **WHEN** the user closes the crop dialog without confirming
- **THEN** no request is made and the existing avatar (or initials fallback) stays

#### Scenario: Disallowed content type at the API
- **WHEN** a client bypasses the UI and requests an upload URL for a `video/mp4` file
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
