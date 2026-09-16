## MODIFIED Requirements

### Requirement: Read access for coaches and admins
The system SHALL let users with the `admin` role read any player's profile (playing details, about text, and account identity incl. avatar) via a read-only endpoint. Professionals SHALL NOT have an endpoint to read arbitrary players; a coach SHALL receive a player's card only embedded in the data of a session they share with that player, and only while that session is in a paid status (`paid_escrow`, `in_progress`, `awaiting_confirmation`, `completed_paid`, `disputed`, `resolved`) — never for `pending_payment` or `cancelled` sessions. Amateurs SHALL NOT be able to read other amateurs' profiles.

#### Scenario: Admin views a player card
- **WHEN** an admin requests a player's profile by id
- **THEN** the playing details, about text, display name, and avatar are returned read-only

#### Scenario: Coach cannot look up an arbitrary player
- **WHEN** a professional requests a player's profile by id
- **THEN** the request is rejected with a forbidden error

#### Scenario: Coach sees the card through a paid session
- **WHEN** a coach reads a session with that player that is `paid_escrow` or later
- **THEN** the session data includes the player's card

#### Scenario: No card before payment or after cancellation
- **WHEN** a coach reads a `pending_payment` or `cancelled` session
- **THEN** the session data carries no player card

#### Scenario: Amateur cannot view another amateur
- **WHEN** an amateur requests another amateur's profile by id
- **THEN** the request is rejected with a forbidden error

## ADDED Requirements

### Requirement: Visibility hint and coach preview
The player profile page SHALL state that coaches the player books can see the profile after payment, and SHALL offer a "How coaches see you" preview rendering the player's own card exactly as a coach receives it.

#### Scenario: Preview matches the coach view
- **WHEN** a player saves their profile and opens the preview
- **THEN** the preview shows the same fields, in the same layout, as the card embedded in a coach's session entry

### Requirement: Unfilled profile state
A player card SHALL indicate that the player has not filled in a profile yet when the profile was never saved by the player, instead of presenting the default level as a fact.

#### Scenario: Never-saved profile
- **WHEN** a coach views the card of a player who never saved their profile
- **THEN** the card shows a "hasn't filled in a profile yet" state and no level

#### Scenario: Saved profile
- **WHEN** the player has saved their profile at least once
- **THEN** the card shows the saved playing details
