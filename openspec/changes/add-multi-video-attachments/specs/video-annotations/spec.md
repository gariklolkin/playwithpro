## MODIFIED Requirements

### Requirement: Annotations bound to a moment of the video
Each stroke SHALL belong to one attached clip and to the moment of that clip (position rounded to a tenth of a second) at which it was drawn. The layer SHALL show a moment's strokes only while that clip is active and paused at that moment (within a small tolerance) and SHALL show nothing while the video is playing or another clip is active. The room SHALL list the active clip's annotated moments as controls that seek the clip to that moment. A stroke naming a clip that is not attached to the session SHALL be ignored.

#### Scenario: Strokes hide during playback and return
- **WHEN** a party resumes playback after annotating 2:14 and later pauses again at 2:14
- **THEN** the strokes are hidden while playing and shown again at 2:14

#### Scenario: Different moments keep separate strokes
- **WHEN** strokes exist at 0:34 and at 2:14
- **THEN** pausing at 0:34 shows only the 0:34 strokes

#### Scenario: Different clips keep separate strokes
- **WHEN** strokes exist at 1:00 of the first clip and the parties switch to the second clip and pause at 1:00
- **THEN** no strokes are shown until the parties return to the first clip at 1:00

#### Scenario: Jump to an annotated moment
- **WHEN** a party activates the moment control for 2:14
- **THEN** the active clip seeks to 2:14 and the strokes for that moment are shown

### Requirement: Ephemeral annotation state with limits
Annotation state SHALL be held by the API in memory per session, keyed by clip, for as long as the session's sync room has a connected party and SHALL be discarded when the room empties; it SHALL NOT be persisted in the MVP. The API SHALL enforce upper bounds on points per stroke, strokes per moment, and annotated moments per clip, and SHALL ignore messages that exceed them or fail validation.

#### Scenario: Room empties, annotations gone
- **WHEN** both parties disconnect from the sync channel and one reconnects later
- **THEN** no annotations are delivered

#### Scenario: Oversized stroke ignored
- **WHEN** a client sends a stroke with more points than the limit
- **THEN** the stroke is not stored or relayed

#### Scenario: Moment cap applies per clip
- **WHEN** the first clip has reached the annotated-moments cap
- **THEN** a new moment on the second clip is still accepted
