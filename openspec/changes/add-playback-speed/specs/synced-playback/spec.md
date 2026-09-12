## MODIFIED Requirements

### Requirement: Shared playback control between the session parties
For `video_analysis` sessions, the session room's attached-video player SHALL share playback state between the two parties: a play, pause, seek, or playback-rate change performed by either party SHALL be reflected on the other party's player in near-real time, positioned at the same point in the video (compensating for elapsed time while playing, scaled by the playback rate) and at the same rate. Sessions of other service types SHALL have no playback sync channel.

#### Scenario: Coach pauses on a moment
- **WHEN** the coach pauses the attached video at 2:14 while both parties are in a video-analysis room
- **THEN** the player's video pauses at the same position

#### Scenario: Seek propagates
- **WHEN** one party seeks the video to a new position
- **THEN** the other party's player moves to that position and keeps the current playing/paused state

#### Scenario: Slow motion propagates
- **WHEN** the coach sets the playback rate to 0.25× while the video is playing
- **THEN** the player's video continues at 0.25× from the same position

#### Scenario: Simultaneous commands converge
- **WHEN** both parties issue playback commands at nearly the same time
- **THEN** both players converge on the later command's state (last writer wins)

#### Scenario: Consultation rooms have no sync channel
- **WHEN** a party is in the room of a consultation session
- **THEN** no playback sync channel exists for the session

### Requirement: Drift correction during shared playback
While the shared state is playing, the system SHALL periodically reassert the shared position, and a synced player whose position deviates from it beyond a bounded threshold (on the order of seconds) SHALL snap back to the shared position. The expected position SHALL advance at the shared playback rate, so a slowed-down playback is not mistaken for drift. When the browser blocks programmatic playback, the affected party SHALL be shown a localized prompt whose activation resumes synced playback, rather than the player silently drifting.

#### Scenario: Drifted follower snaps back
- **WHEN** a synced player's position has drifted beyond the threshold from the shared playing position
- **THEN** that player snaps to the shared position and playback continues in sync

#### Scenario: Slow playback is not drift
- **WHEN** both parties play at 0.25× for a minute
- **THEN** neither player snaps, because the expected position advances at 0.25×

#### Scenario: Autoplay block surfaces a prompt
- **WHEN** applying a remote play command is rejected by the browser's autoplay policy
- **THEN** the party sees a prompt and activating it resumes playback at the shared position

## ADDED Requirements

### Requirement: Playback speed control
The attached-video panel in video-analysis rooms SHALL offer playback-rate presets of 0.25×, 0.5×, 0.75×, 1×, 1.5×, and 2× with the active rate indicated; a rate set by other means (the native player menu) SHALL be displayed as its value. The server SHALL accept rates within the browser-supported range only and SHALL treat a snapshot without a rate as 1×.

#### Scenario: Preset sets the rate
- **WHEN** a party activates the 0.5× preset
- **THEN** their video plays at 0.5× and the preset is highlighted

#### Scenario: Native menu rate shown
- **WHEN** a party picks 1.75× in the browser's native player menu
- **THEN** the speed control shows 1.75× with no preset highlighted, and the peer follows at 1.75×

#### Scenario: Out-of-range rate dropped
- **WHEN** a client publishes a snapshot with a rate of 50
- **THEN** the server ignores the snapshot
