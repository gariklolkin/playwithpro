# player-profiles Specification

## Purpose
Amateur-owned player profiles: playing level and style, experience, optional handedness/grip, and an "about" text. Editable only by the owning amateur; readable by coaches and admins as a player card for upcoming booking and session screens.

## Requirements

### Requirement: Player profile ownership
Each user with the `amateur` role SHALL have exactly one player profile that only they can edit. The profile SHALL be created empty on first access, mirroring the pro-profile draft behavior.

#### Scenario: First access creates an empty profile
- **WHEN** an amateur opens their player profile for the first time
- **THEN** an empty profile is created and returned for them to fill in

#### Scenario: Professional cannot access player profile self-endpoints
- **WHEN** a user with the `professional` role calls a `/players/me/*` endpoint
- **THEN** the request is rejected with a forbidden error

### Requirement: Playing details
A player profile SHALL store: playing level (one of `beginner`, `intermediate`, `advanced`, `competitive`), playing style (one of `offensive`, `all_round`, `defensive`), years of table-tennis experience (integer ≥ 0), optional playing-style attributes (handedness `left`/`right`, grip `shakehand`/`penhold`), and an optional free-form "about" text. All fields except level SHALL be optional.

#### Scenario: Save valid playing details
- **WHEN** an amateur saves level `intermediate`, offensive style, 5 years of experience, right-handed, shakehand grip
- **THEN** the profile persists and returns exactly those values

#### Scenario: Invalid level rejected
- **WHEN** a client submits a level outside the allowed set
- **THEN** the request is rejected with a validation error

#### Scenario: Negative experience rejected
- **WHEN** a client submits `yearsOfExperience = -1`
- **THEN** the request is rejected with a validation error

### Requirement: Read access for coaches and admins
The system SHALL let users with the `professional` or `admin` role read any player's profile (playing details, about text, and account identity incl. avatar) via a read-only endpoint. Amateurs SHALL NOT be able to read other amateurs' profiles.

#### Scenario: Coach views a player card
- **WHEN** a professional requests a player's profile by id
- **THEN** the playing details, about text, display name, and avatar are returned read-only

#### Scenario: Amateur cannot view another amateur
- **WHEN** an amateur requests another amateur's profile by id
- **THEN** the request is rejected with a forbidden error

### Requirement: Player profile page
The web app SHALL provide a profile page in the amateur dashboard where the player edits their avatar and playing details and sees stubbed "My videos" and "My sessions" sections that later changes will populate.

#### Scenario: Edit and save from the profile page
- **WHEN** an amateur edits their level and about text on the profile page and saves
- **THEN** the changes persist and are shown after reload

#### Scenario: Save button follows the dirty-state pattern
- **WHEN** the form matches the last saved state
- **THEN** the Save button is disabled, and it re-enables as soon as any field changes

#### Scenario: Stub sections visible
- **WHEN** an amateur opens their profile page
- **THEN** "My videos" and "My sessions" sections render as empty-state placeholders

### Requirement: Externalized UI strings
All user-facing strings introduced by this change SHALL live in next-intl message catalogs for all five supported locales (en/fr/de/ru/zh), not in component code.

#### Scenario: Catalog completeness
- **WHEN** the web app builds
- **THEN** no player-profile page or component contains hard-coded user-facing strings
