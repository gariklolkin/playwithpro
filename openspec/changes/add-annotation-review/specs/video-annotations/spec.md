## MODIFIED Requirements

### Requirement: Ephemeral annotation state with limits
Annotation state SHALL be persisted per session: every accepted stroke, undo, and clear SHALL be written to durable storage in the order it was applied, so the annotation set survives disconnects, API restarts, and the end of the session. The API SHALL keep an in-memory copy per session for as long as the session's sync room has a connected party, SHALL load the stored set into memory before serving the first catch-up after the room was empty, and SHALL discard only the in-memory copy when the room empties. Persistence failures SHALL be logged and SHALL NOT interrupt realtime relay. The API SHALL enforce upper bounds on points per stroke, strokes per moment, and annotated moments per session, and SHALL ignore messages that exceed them or fail validation.

#### Scenario: Room empties, annotations return
- **WHEN** both parties disconnect from the sync channel and one reconnects later inside the join window
- **THEN** the previously drawn annotations are delivered in the catch-up

#### Scenario: API restart keeps annotations
- **WHEN** the API restarts during a session and a party reconnects
- **THEN** the strokes drawn before the restart are delivered

#### Scenario: Undo is durable
- **WHEN** a party undoes a stroke and both parties later reconnect
- **THEN** the undone stroke is not delivered

#### Scenario: Oversized stroke ignored
- **WHEN** a client sends a stroke with more points than the limit
- **THEN** the stroke is not stored or relayed
