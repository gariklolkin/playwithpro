## MODIFIED Requirements

### Requirement: Player profile page
The web app SHALL provide a profile page in the amateur dashboard where the player edits their avatar and playing details. The page SHALL NOT duplicate content owned by dedicated dashboard tabs: videos live only on the video-library tab and sessions only on the sessions tab (owner decision 2026-07-20, replacing the earlier "My videos" summary card and "My sessions" stub).

#### Scenario: Edit and save from the profile page
- **WHEN** an amateur edits their level and about text on the profile page and saves
- **THEN** the changes persist and are shown after reload

#### Scenario: Save button follows the dirty-state pattern
- **WHEN** the form matches the last saved state
- **THEN** the Save button is disabled, and it re-enables as soon as any field changes

#### Scenario: No duplicated video or session sections
- **WHEN** an amateur opens their profile page
- **THEN** it contains no "My videos" or "My sessions" cards — those live on their dashboard tabs
