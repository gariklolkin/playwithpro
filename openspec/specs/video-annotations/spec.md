# video-annotations Specification

## Purpose
Drawing tools over the attached video in video-analysis session rooms: moment-bound strokes shared between the parties in real time over the sync channel, with ephemeral server-side state and enforced limits.

## Requirements
### Requirement: Drawing tools over the attached video
For `video_analysis` sessions, the session room SHALL provide an annotation layer over the attached video with a pen tool, a straight-line tool, and an angle tool (three points defining two rays from a vertex, with the angle at the vertex shown in whole degrees on the frame). Each party SHALL have a default stroke color by role and SHALL be able to undo their own most recent stroke on the current moment and to clear the current moment. Activating a drawing tool SHALL pause the video; with no tool active, the layer SHALL NOT intercept interaction with the player controls. Sessions of other service types SHALL have no annotation layer.

#### Scenario: Coach measures a knee angle
- **WHEN** the coach selects the angle tool on a paused frame and places three points (hip, knee, ankle)
- **THEN** two rays and the angle value at the knee are drawn on the frame

#### Scenario: Pen stroke on a paused frame
- **WHEN** a party draws with the pen while the video is paused
- **THEN** the stroke appears over the frame in that party's color

#### Scenario: Tool activation pauses playback
- **WHEN** a party selects a drawing tool while the video is playing
- **THEN** the video pauses before drawing starts

#### Scenario: Controls stay usable without a tool
- **WHEN** no drawing tool is active
- **THEN** clicks on the player controls reach the player

### Requirement: Annotations bound to a moment of the video
Each stroke SHALL belong to the video moment (position rounded to a tenth of a second) at which it was drawn. The layer SHALL show a moment's strokes only while the video is paused at that moment (within a small tolerance) and SHALL show nothing while the video is playing. The room SHALL list annotated moments as controls that seek the video to that moment.

#### Scenario: Strokes hide during playback and return
- **WHEN** a party resumes playback after annotating 2:14 and later pauses again at 2:14
- **THEN** the strokes are hidden while playing and shown again at 2:14

#### Scenario: Different moments keep separate strokes
- **WHEN** strokes exist at 0:34 and at 2:14
- **THEN** pausing at 0:34 shows only the 0:34 strokes

#### Scenario: Jump to an annotated moment
- **WHEN** a party activates the moment control for 2:14
- **THEN** the video seeks to 2:14 and the strokes for that moment are shown

### Requirement: Realtime sharing between the parties
A stroke, undo, or clear performed by either party SHALL be reflected on the other party's annotation layer in near-real time over the session's sync channel. Strokes SHALL use coordinates normalized to the video's content area so both parties see them on the same part of the frame regardless of viewport size or letterboxing. A party connecting or reconnecting to the channel SHALL receive the current set of annotations for the session.

#### Scenario: Player sees the coach's line
- **WHEN** the coach draws a line on a paused frame
- **THEN** the player's layer shows the same line on the same part of the frame

#### Scenario: Same spot on different window sizes
- **WHEN** the coach draws at the racket in a wide window and the player views on a narrow stacked layout
- **THEN** the stroke lands on the racket in the player's view

#### Scenario: Late joiner catches up
- **WHEN** the player connects after the coach has annotated two moments
- **THEN** the player receives both moments' strokes and the moment controls list them

#### Scenario: Undo removes only the author's stroke
- **WHEN** both parties have drawn on a moment and the coach undoes
- **THEN** only the coach's most recent stroke disappears for both parties

### Requirement: Ephemeral annotation state with limits
Annotation state SHALL be held by the API in memory per session for as long as the session's sync room has a connected party and SHALL be discarded when the room empties; it SHALL NOT be persisted in the MVP. The API SHALL enforce upper bounds on points per stroke, strokes per moment, and annotated moments per session, and SHALL ignore messages that exceed them or fail validation.

#### Scenario: Room empties, annotations gone
- **WHEN** both parties disconnect from the sync channel and one reconnects later
- **THEN** no annotations are delivered

#### Scenario: Oversized stroke ignored
- **WHEN** a client sends a stroke with more points than the limit
- **THEN** the stroke is not stored or relayed

### Requirement: Localized annotation UI
The annotation toolbar (tools, color, undo, clear), moment controls, and any hints SHALL render from next-intl catalogs in all five locales with no hard-coded strings.

#### Scenario: Localized toolbar
- **WHEN** a party uses the annotation tools in any supported locale
- **THEN** all annotation UI strings render from that locale's catalog
