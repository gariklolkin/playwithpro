# session-rooms Specification (delta)

## ADDED Requirements

### Requirement: Session room access for the two parties
The system SHALL provide a session room descriptor for online sessions (`video_analysis`, `consultation`) to exactly the session's two parties; any other user's request SHALL yield not-found. The descriptor SHALL be available for sessions in `paid_escrow`, `in_progress`, or `awaiting_confirmation`, and the joinable room details SHALL be released only within the join window — from a configurable lead before `startsAt` (default 15 minutes) until a configurable grace after `endsAt` (default 30 minutes). Outside the window the response SHALL carry timing metadata (so the UI can show a countdown or a closed state) but no joinable room. In-person `game` sessions SHALL have no video room; their session detail SHALL present the coach's venue information instead.

#### Scenario: Party joins within the window
- **WHEN** the player or coach of a `paid_escrow` consultation session requests the room 10 minutes before `startsAt`
- **THEN** they receive the embedded-room details and can join the call

#### Scenario: Too early to join
- **WHEN** a party requests the room 2 hours before `startsAt`
- **THEN** the response contains session timing but no joinable room, and the room page shows a countdown

#### Scenario: Third party denied
- **WHEN** a user who is not a party of the session requests its room
- **THEN** the request yields not-found

#### Scenario: Game session has no room
- **WHEN** a party opens the session detail of a paid `game` session
- **THEN** they see the venue information and no video-room join affordance

### Requirement: Embedded video room via provider abstraction
Session rooms SHALL obtain their video-call details through a `VideoProvider` abstraction so business logic never binds to a vendor. The MVP implementation SHALL be an embedded Jitsi room on a configurable Jitsi domain, requiring no account from either party. The room name SHALL derive from a cryptographically random slug generated per session when payment succeeds, and the slug SHALL be exposed only to the session's parties (room descriptor and calendar invite); it SHALL remain stable for the session's lifetime.

#### Scenario: Jitsi room embedded in the platform page
- **WHEN** a party joins the session room during the join window
- **THEN** the Jitsi call is embedded in the platform session-room page (no external account required)

#### Scenario: Room name not guessable
- **WHEN** a session's room is provisioned at payment time
- **THEN** its room name contains a cryptographically random slug that appears in no public or third-party-accessible response

### Requirement: Side-by-side attached video for video-analysis sessions
For `video_analysis` sessions, the session room SHALL present the session's attached video player alongside the call for both parties, using the existing per-session playback access (the session coach is admitted to the attached video's playback URL). On narrow viewports the layout SHALL stack. Sessions of other service types SHALL NOT show a video panel.

#### Scenario: Coach sees the video next to the call
- **WHEN** the coach joins the room of a video-analysis session
- **THEN** the attached video is playable side by side with the embedded call

#### Scenario: Consultation room has no video panel
- **WHEN** a party joins the room of a consultation session
- **THEN** only the call is shown, with no video player panel

### Requirement: Attendance logging
The system SHALL record an attendance entry (user, session, join time) each time a party enters the session room during the join window, and SHALL best-effort record the leave time. Attendance entries SHALL be retained per session as evidence for later confirmation and dispute handling, and repeated joins SHALL each be recorded. Attendance SHALL NOT drive session status transitions.

#### Scenario: Join is logged
- **WHEN** a party enters the session room during the join window
- **THEN** an attendance entry with their identity and join time is recorded for the session

#### Scenario: Rejoin logged separately
- **WHEN** a party leaves and re-enters the room
- **THEN** a second attendance entry is recorded

#### Scenario: No-show leaves no entries
- **WHEN** neither party ever enters the room of a session
- **THEN** the session has no attendance entries while its status still progresses on schedule

### Requirement: Time-driven session progression
Paid sessions SHALL progress by clock time: `paid_escrow → in_progress` once `startsAt` is reached, and `in_progress → awaiting_confirmation` once `endsAt` is reached. Progression SHALL be enforced both by a periodic sweep (also run at startup) and inline on session read paths, following the established expiry-sweep pattern. Confirmation actions on `awaiting_confirmation` are out of scope for this change.

#### Scenario: Session starts on time
- **WHEN** the sweep runs after `startsAt` for a `paid_escrow` session
- **THEN** the session becomes `in_progress`

#### Scenario: Session awaits confirmation after end
- **WHEN** `endsAt` has passed for an `in_progress` session
- **THEN** the session becomes `awaiting_confirmation`

#### Scenario: Read path normalizes a stale status
- **WHEN** a party fetches a session whose `endsAt` passed but the sweep has not yet run
- **THEN** the returned session is already `awaiting_confirmation`

### Requirement: Localized session room
The session room page — countdown/closed states, join controls, video panel, venue block for game sessions — SHALL render from next-intl catalogs in all five locales with no hard-coded strings, and SHALL show session times in the viewer's timezone.

#### Scenario: Localized room page
- **WHEN** a party opens the session room in any supported locale
- **THEN** all room UI strings render from that locale's catalog
