## MODIFIED Requirements

### Requirement: Player profile page
The web app SHALL provide a profile page in the amateur dashboard where the player edits their avatar and playing details. The "My videos" section SHALL show a compact summary of the player's video library — the most recent uploads with status and a link to the full library page — instead of a stub; the "My sessions" section remains a stubbed placeholder that a later change will populate.

#### Scenario: Edit and save from the profile page
- **WHEN** an amateur edits their level and about text on the profile page and saves
- **THEN** the changes persist and are shown after reload

#### Scenario: Save button follows the dirty-state pattern
- **WHEN** the form matches the last saved state
- **THEN** the Save button is disabled, and it re-enables as soon as any field changes

#### Scenario: Videos summary with uploads
- **WHEN** an amateur with uploaded videos opens their profile page
- **THEN** the "My videos" card lists their most recent videos with status and links to the video library

#### Scenario: Videos summary without uploads
- **WHEN** an amateur with no videos opens their profile page
- **THEN** the "My videos" card shows an empty-state hint linking to the video library

#### Scenario: Sessions stub visible
- **WHEN** an amateur opens their profile page
- **THEN** the "My sessions" section renders as an empty-state placeholder
