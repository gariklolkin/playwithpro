# user-accounts — delta for update-signup-timezone

## ADDED Requirements

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
