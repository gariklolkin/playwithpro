## ADDED Requirements

### Requirement: Videos in account deletion
A player's videos — originals, playback renditions, in-flight uploads and their rows — SHALL be purged when the deletion executes, and coaches SHALL lose access to that player's clips from the moment the request is accepted. New uploads SHALL be refused during the grace period.

#### Scenario: Coach loses access at request time
- **WHEN** a player with a past session requests deletion
- **THEN** the coach's request for one of that player's clips is refused

#### Scenario: Objects gone after execution
- **WHEN** the deletion executes
- **THEN** no object remains under the player's video and avatar prefixes
