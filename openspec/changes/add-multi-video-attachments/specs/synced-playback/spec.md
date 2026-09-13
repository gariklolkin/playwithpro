## MODIFIED Requirements

### Requirement: Shared playback control between the session parties
For `video_analysis` sessions, the session room's attached-clip player SHALL share playback state between the two parties: the active clip, and a play, pause, or seek performed by either party SHALL be reflected on the other party's player in near-real time, on the same clip and positioned at the same point in it (compensating for elapsed time while playing). Switching to another attached clip SHALL propagate as a shared state at the start of that clip, paused. The API SHALL ignore a shared state naming a clip that is not attached to the session. Sessions of other service types SHALL have no playback sync channel.

#### Scenario: Coach pauses on a moment
- **WHEN** the coach pauses the active clip at 2:14 while both parties are in a video-analysis room
- **THEN** the player's video pauses at the same position of the same clip

#### Scenario: Seek propagates
- **WHEN** one party seeks the video to a new position
- **THEN** the other party's player moves to that position and keeps the current playing/paused state

#### Scenario: Clip switch propagates
- **WHEN** the coach switches from the first clip to the second while both parties are synced
- **THEN** the player's panel switches to the second clip at its start, paused

#### Scenario: Foreign clip ignored
- **WHEN** a client publishes a state naming a video that is not in the session's attachment set
- **THEN** the state is neither stored nor relayed

#### Scenario: Simultaneous commands converge
- **WHEN** both parties issue playback commands at nearly the same time
- **THEN** both players converge on the later command's state (last writer wins)

#### Scenario: Consultation rooms have no sync channel
- **WHEN** a party is in the room of a consultation session
- **THEN** no playback sync channel exists for the session

### Requirement: State catch-up on join and reconnect
A party whose sync connection is established (or re-established) while a shared playback state exists SHALL receive the current shared state, including the active clip, and their player SHALL conform to it. When no shared state exists yet, the player SHALL show the first clip at its initial position until the first command.

#### Scenario: Late joiner conforms
- **WHEN** the coach has switched to the third clip and been navigating it, and the player then joins the room
- **THEN** the player's panel shows the third clip at the current shared position and playing state

#### Scenario: Reconnect resumes sync
- **WHEN** a party's connection drops and is re-established during the session
- **THEN** their player conforms to the current shared clip and state without either party issuing a new command

#### Scenario: Detached party browses another clip
- **WHEN** a party with sync switched off opens a different clip and later switches sync back on
- **THEN** their panel returns to the shared clip and position
