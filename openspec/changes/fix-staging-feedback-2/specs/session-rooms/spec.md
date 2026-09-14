## MODIFIED Requirements

### Requirement: Side-by-side attached video for video-analysis sessions
For `video_analysis` sessions, the session room SHALL present the session's attached clips together with the call for both parties: a clip switcher listing the clips in order with their notes, and a player for the active clip, using the existing per-session playback access (the session coach is admitted to every attached clip's playback URL). Once the party has joined the call, the room SHALL use a theatre layout: the video card occupies the main column and the call occupies a narrower presence rail beside it whose height matches the video card. The video card's width SHALL follow the active clip's aspect ratio at the frame height, bounded by the main column width and by a minimum width that keeps the timeline usable (letterboxing the sides of narrower clips). For landscape clips the width not used by the card SHALL go to the presence rail. For portrait clips (taller than wide) the frame SHALL be allowed to grow taller than the landscape frame (up to about 80 % of the viewport height), the card SHALL narrow to the clip's aspect down to a smaller minimum width at which the player bar wraps its timeline onto its own row, the presence rail SHALL be capped in width, and the card and rail SHALL be centred in the column rather than stretching the rail. Each party SHALL be able to enter a focus mode that hides the presence rail so the video card takes the full column while the call stays connected with its audio, keeping microphone, leave, and exit-focus controls reachable; exiting SHALL restore the rail. On viewports narrower than the theatre breakpoint the rail SHALL stack under the video card, and on phone-width viewports the room SHALL be a single column. Before the party joins, the pre-join panel SHALL be shown next to the clip panel as before. A session whose clips were all removed SHALL show a notice in place of the panel. Sessions of other service types SHALL NOT show a video panel.

#### Scenario: Coach sees the clips next to the call
- **WHEN** the coach joins the room of a video-analysis session with three clips
- **THEN** the three clips are listed with their notes, the first one is shown in the main column, and the call is shown in the presence rail beside it

#### Scenario: Switching clips
- **WHEN** a party selects the second clip in the switcher
- **THEN** the player shows the second clip from its start, paused

#### Scenario: Landscape clip fills the frame
- **WHEN** the active clip is 16:9 on a wide desktop viewport
- **THEN** the video card takes the full main-column width and the clip fills it without side bars

#### Scenario: Portrait clip grows tall and centred
- **WHEN** the parties switch to a 9:16 clip on a wide desktop viewport
- **THEN** the video card becomes taller than the landscape frame and as narrow as the clip's aspect allows (not below the portrait minimum), the presence rail beside it is no wider than its cap, and the pair is centred in the column

#### Scenario: Focus mode keeps the call
- **WHEN** the coach enters focus mode during the call
- **THEN** the presence rail is hidden, the video card takes the full column, the call audio continues, and microphone, leave, and exit-focus controls remain available

#### Scenario: Narrow viewport stacks
- **WHEN** a party opens the joined room on a viewport narrower than the theatre breakpoint
- **THEN** the call is shown under the video card instead of beside it

#### Scenario: Consultation room has no video panel
- **WHEN** a party joins the room of a consultation session
- **THEN** only the call is shown, with no video player panel

### Requirement: Native call UI in the session room
The session room page SHALL render the video call natively (no third-party iframe or externally hosted UI) using the platform's design system. Inside the join window the page SHALL first present a pre-join panel with a local camera preview, camera and microphone device selection, and mute toggles, and SHALL connect only when the party explicitly joins. During the call the page SHALL show the counterpart's video (or their screen share when active) as the main tile, the party's own video as a secondary tile, controls for microphone, camera, screen share (where the browser supports it), and leaving the call, a connection-quality/reconnecting indicator, and a waiting state naming the counterpart until they connect. During the call the party SHALL also be able to open a devices menu and switch the camera, the microphone and — where the browser supports output routing — the speaker; a switch SHALL replace the published track in place without disconnecting, rejoining, or recording a new attendance entry, and the menu SHALL be reachable in every call layout (stage, presence rail, focus bar). In video-analysis rooms the call SHALL be presented in the presence rail: the counterpart tile above the party's own tile, with the call controls pinned to the bottom of the rail, and the party SHALL be able to hide their own tile, which gives the rail's space to the counterpart tile, does not stop publishing their camera, and is remembered in that browser. Changing the room layout (focus mode, stacking, hiding the own tile) SHALL NOT disconnect or reconnect the call. Leaving SHALL disconnect the call and offer rejoining, which performs a new join.

#### Scenario: Pre-join before connecting
- **WHEN** a party opens the session room during the join window
- **THEN** they see their camera preview and device controls and are not yet connected to the call until they choose to join

#### Scenario: Counterpart not yet present
- **WHEN** a party joins the call before the other party has connected
- **THEN** the main tile shows a waiting state naming the counterpart, and their own preview remains visible

#### Scenario: Screen share takes the main tile
- **WHEN** the coach starts a screen share during the call
- **THEN** the player's main tile switches to the shared screen while the coach's camera moves to a secondary tile

#### Scenario: Switching the camera mid-call
- **WHEN** the coach opens the devices menu during the call and picks another camera
- **THEN** the player starts receiving the new camera's video, the call is not disconnected or rejoined, and no new attendance entry is recorded

#### Scenario: Speaker picker only where supported
- **WHEN** a party opens the devices menu in a browser that cannot route audio output
- **THEN** the menu offers camera and microphone pickers and no speaker picker

#### Scenario: Presence rail in a video-analysis room
- **WHEN** the player joins the call of a video-analysis session on a wide desktop viewport
- **THEN** the coach's tile is shown at the top of the rail, the player's own tile under it, and the call controls at the bottom of the rail

#### Scenario: Hiding the own tile
- **WHEN** the player hides their own tile
- **THEN** the coach's tile takes the rail's space, the coach still receives the player's camera, and the tile stays hidden after a page reload in the same browser

#### Scenario: Layout change keeps the connection
- **WHEN** a party enters and exits focus mode during the call
- **THEN** the call is neither disconnected nor rejoined and no new attendance entry is recorded

#### Scenario: Leave and rejoin
- **WHEN** a party leaves the call and then chooses to rejoin
- **THEN** the call disconnects, a new join is performed, and they reconnect with a fresh token
