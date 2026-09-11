## ADDED Requirements

### Requirement: Session annotation review for the parties
The system SHALL provide the two parties of a `video_analysis` session a review view of that session's persisted annotations: the attached video with the stored strokes rendered read-only over it, and the annotated moments listed as controls that seek the video. The review SHALL be available from the first stored stroke onward, regardless of session status, and SHALL NOT allow adding, undoing, or clearing strokes. Users who are not a party to the session SHALL be denied. Sessions of other service types SHALL have no review view.

#### Scenario: Player reviews after the session
- **WHEN** the player opens the review view of a completed video-analysis session that has annotated moments
- **THEN** the video is shown with the moment controls, and selecting a moment seeks the video and shows that moment's strokes read-only

#### Scenario: Coach reviews their own annotations
- **WHEN** the coach opens the review view of a session they annotated
- **THEN** the same strokes and moments are shown

#### Scenario: Third party denied
- **WHEN** a signed-in user who is neither party requests a session's annotations
- **THEN** the request is rejected as not found

#### Scenario: No annotations yet
- **WHEN** a party opens the review view of a session with no stored strokes
- **THEN** the view explains that nothing has been annotated and shows no moment controls

### Requirement: Review entry points
The session list SHALL link to the review view for sessions that have at least one annotated moment, and the session room SHALL link to it once the join window has closed. The session representation returned to the parties SHALL carry the number of annotated moments.

#### Scenario: Link appears once a moment exists
- **WHEN** a session has one or more annotated moments
- **THEN** its session list entry shows a link to the review view

#### Scenario: Closed room points to the review
- **WHEN** a party opens the room page of an annotated session after the join window has closed
- **THEN** the closed state offers a link to the review view

### Requirement: Annotated frame export
From the review view, a party SHALL be able to download the currently shown moment as a PNG image composed of the video frame at that moment and the strokes rendered over it, at the video's native resolution. The attached video SHALL be served in a way that allows the browser to read its frames for this composition.

#### Scenario: Export a moment
- **WHEN** a party selects export while the review sits on an annotated moment
- **THEN** a PNG containing that frame with the strokes is downloaded

#### Scenario: Export unavailable while playing
- **WHEN** the video is playing or sits on a moment without strokes
- **THEN** the export control is disabled

### Requirement: Attached video removed after annotation
When the attached video of an annotated session has been deleted, the stored annotations SHALL be retained and the review view SHALL explain that the video is no longer available instead of rendering the player.

#### Scenario: Video deleted by its owner
- **WHEN** the player deletes the video after the session was annotated
- **THEN** the review view shows the moments list with a notice that the video was removed, and export is unavailable

### Requirement: Annotation activity as dispute evidence
For each dispute, the admin dispute queue SHALL present an annotation activity summary for the session: the number of annotated moments, and per author the stroke count with the first and last stroke times. The summary SHALL NOT expose the strokes, their coordinates, or the video.

#### Scenario: Admin sees annotation activity
- **WHEN** an admin reviews a dispute over a video-analysis session in which the coach drew 12 strokes across 4 moments
- **THEN** the dispute entry shows 4 moments and, for the coach, 12 strokes with first and last times

#### Scenario: No activity
- **WHEN** the disputed session has no stored strokes
- **THEN** the entry states that no annotations were made

### Requirement: Localized review experience
The review view, its entry points, the export control, and the dispute evidence block SHALL render from next-intl catalogs in all five locales with no hard-coded strings.

#### Scenario: Localized review view
- **WHEN** a party opens the review view in any supported locale
- **THEN** all its strings render from that locale's catalog
