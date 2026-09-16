## ADDED Requirements

### Requirement: Player context in the session room
The session room response SHALL include the session goal for both parties and, for the coach only, the player's card, under the paid-session rule of the player-profiles capability. The room page SHALL offer the coach a collapsed "About the player" disclosure next to the room header in both video-analysis and consultation rooms, showing the card and the goal without changing the call layout or reconnecting the call.

#### Scenario: Coach opens the disclosure in the room
- **WHEN** the coach expands "About the player" in the session room header
- **THEN** the player's card and the goal are shown and the call stays connected

#### Scenario: Player sees no disclosure
- **WHEN** the player opens the session room
- **THEN** no player card is included in the response and no disclosure is offered
