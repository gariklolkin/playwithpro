# synced-playback Specification

## Purpose
Shared playback of the attached video between the two parties of a video-analysis session room: a party-only, join-window-scoped realtime sync channel, command propagation, catch-up on join/reconnect, drift correction, per-user opt-out, and localized sync UI.

## Requirements

### Requirement: Shared playback control between the session parties
For `video_analysis` sessions, the session room's attached-video player SHALL share playback state between the two parties: a play, pause, or seek performed by either party SHALL be reflected on the other party's player in near-real time, positioned at the same point in the video (compensating for elapsed time while playing). Sessions of other service types SHALL have no playback sync channel.

#### Scenario: Coach pauses on a moment
- **WHEN** the coach pauses the attached video at 2:14 while both parties are in a video-analysis room
- **THEN** the player's video pauses at the same position

#### Scenario: Seek propagates
- **WHEN** one party seeks the video to a new position
- **THEN** the other party's player moves to that position and keeps the current playing/paused state

#### Scenario: Simultaneous commands converge
- **WHEN** both parties issue playback commands at nearly the same time
- **THEN** both players converge on the later command's state (last writer wins)

#### Scenario: Consultation rooms have no sync channel
- **WHEN** a party is in the room of a consultation session
- **THEN** no playback sync channel exists for the session

### Requirement: Party-only, window-scoped sync channel
The playback sync channel SHALL authenticate the connecting user with the platform's existing session credentials and SHALL admit only the two parties of the session, only while the session is in a room-eligible status (`paid_escrow`, `in_progress`, `awaiting_confirmation`) and within the room join window. Connections failing any check SHALL be rejected. The channel SHALL carry playback state only — it SHALL NOT expose the video playback URL, room slug, or any session data beyond playback state.

#### Scenario: Third party rejected
- **WHEN** an authenticated user who is not a party of the session attempts to connect to its sync channel
- **THEN** the connection is rejected

#### Scenario: Outside the join window rejected
- **WHEN** a party attempts to connect to the sync channel two hours before the session's join window opens
- **THEN** the connection is rejected

### Requirement: State catch-up on join and reconnect
A party whose sync connection is established (or re-established) while a shared playback state exists SHALL receive the current shared state and their player SHALL conform to it. When no shared state exists yet, the player SHALL remain at its initial position until the first command.

#### Scenario: Late joiner conforms
- **WHEN** the coach has been navigating the video and the player then joins the room
- **THEN** the player's video conforms to the current shared position and playing state

#### Scenario: Reconnect resumes sync
- **WHEN** a party's connection drops and is re-established during the session
- **THEN** their player conforms to the current shared state without either party issuing a new command

### Requirement: Drift correction during shared playback
While the shared state is playing, the system SHALL periodically reassert the shared position, and a synced player whose position deviates from it beyond a bounded threshold (on the order of seconds) SHALL snap back to the shared position. When the browser blocks programmatic playback, the affected party SHALL be shown a localized prompt whose activation resumes synced playback, rather than the player silently drifting.

#### Scenario: Drifted follower snaps back
- **WHEN** a synced player's position has drifted beyond the threshold from the shared playing position
- **THEN** that player snaps to the shared position and playback continues in sync

#### Scenario: Autoplay block surfaces a prompt
- **WHEN** applying a remote play command is rejected by the browser's autoplay policy
- **THEN** the party sees a prompt and activating it resumes playback at the shared position

### Requirement: Per-user sync opt-out
Each party SHALL be able to turn sync off for themselves, after which their player ignores shared state and their local actions are not propagated, and to turn it back on, which SHALL snap their player to the current shared state. One party's toggle SHALL NOT affect the other party's sync behavior.

#### Scenario: Detach to browse privately
- **WHEN** the player turns sync off and scrubs to a different position
- **THEN** their player moves independently and the coach's player is unaffected

#### Scenario: Re-attach snaps back
- **WHEN** a party who had sync off turns it back on
- **THEN** their player conforms to the current shared state

### Requirement: Localized sync controls
The sync toggle, sync status indication, and resume-sync prompt SHALL render from next-intl catalogs in all five locales with no hard-coded strings.

#### Scenario: Localized sync UI
- **WHEN** a party uses the video-analysis room in any supported locale
- **THEN** all sync-related UI strings render from that locale's catalog
