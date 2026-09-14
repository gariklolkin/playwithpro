## MODIFIED Requirements

### Requirement: Drawing tools over the attached video
For `video_analysis` sessions, the session room SHALL provide an annotation layer over the attached video with a pen tool, a straight-line tool, and an angle tool (three points defining two rays from a vertex, with the angle at the vertex shown in whole degrees on the frame). Each party SHALL have a default stroke color by role and SHALL be able to undo their own most recent stroke on the current moment and to clear the current moment. Activating a drawing tool SHALL pause the video; with no tool active, the layer SHALL NOT intercept interaction with the player controls. The layer SHALL be bound to the currently displayed clip's player element — when the active clip changes, including to a clip whose playback source was already loaded, the layer SHALL measure and draw over the new element — and SHALL accept no drawing input while the displayed frame has no measured size, so that a stroke can never paint outside the frame's content area. Sessions of other service types SHALL have no annotation layer.

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

#### Scenario: Drawing after switching clips back
- **WHEN** a party switches from the first clip to the second and back to the first, then draws a pen stroke
- **THEN** the stroke is drawn at the pointer's position over the first clip's frame and nothing else on the card changes color

#### Scenario: No input without a measured frame
- **WHEN** the layer has not yet measured the displayed frame (zero-size content box)
- **THEN** pointer input produces no stroke
