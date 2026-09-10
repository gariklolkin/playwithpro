## MODIFIED Requirements

### Requirement: Party-only, window-scoped sync channel
The playback sync channel SHALL authenticate the connecting user with the platform's existing session credentials and SHALL admit only the two parties of the session, only while the session is in a room-eligible status (`paid_escrow`, `in_progress`, `awaiting_confirmation`) and within the room join window. Connections failing any check SHALL be rejected. The channel SHALL carry playback state and video annotation events only — it SHALL NOT expose the video playback URL, room slug, or any session data beyond playback state and annotations.

#### Scenario: Third party rejected
- **WHEN** an authenticated user who is not a party of the session attempts to connect to its sync channel
- **THEN** the connection is rejected

#### Scenario: Outside the join window rejected
- **WHEN** a party attempts to connect to the sync channel two hours before the session's join window opens
- **THEN** the connection is rejected

#### Scenario: Annotation events share the channel's scope
- **WHEN** an admitted party sends an annotation event on the channel
- **THEN** it is relayed only to the other party of the same session
