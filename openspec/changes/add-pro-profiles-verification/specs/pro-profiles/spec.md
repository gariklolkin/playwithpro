# pro-profiles — delta for add-pro-profiles-verification

## ADDED Requirements

### Requirement: Coach profile ownership
Each user with the `professional` role SHALL have exactly one pro profile (bio, achievements, spoken languages) that only they — and admins — can read in full and only they can edit.

#### Scenario: First access creates a draft
- **WHEN** a professional opens their profile for the first time
- **THEN** an empty profile in `draft` status is returned for them to fill in

#### Scenario: Amateur cannot access coach profile endpoints
- **WHEN** a user with the `amateur` role calls a `/pros/me/*` endpoint
- **THEN** the request is rejected with a forbidden error

### Requirement: Services and pricing
A coach SHALL be able to offer up to three services — `video_analysis`, `consultation`, `game` — each with an hourly price stored as integer minor units plus an ISO 4217 currency code, and toggle each service active or inactive.

#### Scenario: Price is stored in minor units
- **WHEN** a coach sets the consultation price to €40/hour
- **THEN** the service persists `priceMinor = 4000`, `currency = "EUR"` and is returned as such by the API

#### Scenario: One service per type
- **WHEN** a coach upserts the `consultation` service twice
- **THEN** the existing service is updated rather than duplicated

### Requirement: Venue for in-person game service
The `game` service SHALL require a venue picked on a map: a human-readable label (club/address, via OpenStreetMap address search) plus latitude/longitude coordinates, since the session happens in person and later feeds calendar invites and geo-search.

#### Scenario: Game service without a mapped venue
- **WHEN** a coach saves the `game` service without a venue label or coordinates
- **THEN** the request is rejected with a validation error

#### Scenario: Pin refinement
- **WHEN** a coach picks an address suggestion and then drags the map pin
- **THEN** the stored coordinates follow the pin while the label stays

### Requirement: Spoken languages
A coach profile SHALL list at least one spoken language chosen from the platform's supported languages, for later catalog filtering.

#### Scenario: Unsupported language code
- **WHEN** a coach submits a language code outside the supported set
- **THEN** the request is rejected with a validation error
