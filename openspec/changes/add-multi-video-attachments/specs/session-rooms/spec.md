## MODIFIED Requirements

### Requirement: Side-by-side attached video for video-analysis sessions
For `video_analysis` sessions, the session room SHALL present the session's attached clips alongside the call for both parties: a clip switcher listing the clips in order with their notes, and a player for the active clip, using the existing per-session playback access (the session coach is admitted to every attached clip's playback URL). On narrow viewports the layout SHALL stack. A session whose clips were all removed SHALL show a notice in place of the panel. Sessions of other service types SHALL NOT show a video panel.

#### Scenario: Coach sees the clips next to the call
- **WHEN** the coach joins the room of a video-analysis session with three clips
- **THEN** the three clips are listed with their notes and the first one is playable side by side with the call

#### Scenario: Switching clips
- **WHEN** a party selects the second clip in the switcher
- **THEN** the player shows the second clip from its start, paused

#### Scenario: Consultation room has no video panel
- **WHEN** a party joins the room of a consultation session
- **THEN** only the call is shown, with no video player panel
