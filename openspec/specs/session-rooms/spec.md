# session-rooms Specification

## Purpose
Online session rooms: party-only access to a natively rendered LiveKit call within a join window (per-participant tokens minted on an explicit join), side-by-side attached video for video-analysis sessions, attendance logging enriched with provider connection evidence, and clock-driven session progression from escrow to awaiting confirmation.

## Requirements

### Requirement: Session room access for the two parties
The system SHALL provide a session room descriptor for online sessions (`video_analysis`, `consultation`) to exactly the session's two parties; any other user's request SHALL yield not-found. The descriptor SHALL be available for sessions in `paid_escrow`, `in_progress`, or `awaiting_confirmation`, and the room details (provider signaling URL and room name) SHALL be released only within the join window — from a configurable lead before `startsAt` (default 15 minutes) until a configurable grace after `endsAt` (default 30 minutes). Outside the window the response SHALL carry timing metadata (so the UI can show a countdown or a closed state) but no room details. The room details alone SHALL NOT admit anyone to the call; admission requires a participant token issued by the join action. In-person `game` sessions SHALL have no video room; their session detail SHALL present the coach's venue information instead.

#### Scenario: Party joins within the window
- **WHEN** the player or coach of a `paid_escrow` consultation session requests the room 10 minutes before `startsAt`
- **THEN** they receive the room details, can pre-check their devices, and can join the call

#### Scenario: Too early to join
- **WHEN** a party requests the room 2 hours before `startsAt`
- **THEN** the response contains session timing but no room details, and the room page shows a countdown

#### Scenario: Third party denied
- **WHEN** a user who is not a party of the session requests its room
- **THEN** the request yields not-found

#### Scenario: Game session has no room
- **WHEN** a party opens the session detail of a paid `game` session
- **THEN** they see the venue information and no video-room join affordance

### Requirement: Token-authorized video room via provider abstraction
Session rooms SHALL obtain their video-call details and participant admission through a `VideoProvider` abstraction so business logic never binds to a vendor. The provider SHALL describe a room (signaling URL, room name) and SHALL issue a per-participant access token bound to the session's room, the participant's platform user id (as the participant identity), their display name, and their role in the session, with a short time-to-live (at most 10 minutes) that covers the initial connection only. The MVP implementation SHALL be a self-hosted LiveKit server; no account with any third party SHALL be required from either party. The room name SHALL derive from a cryptographically random slug generated per session when payment succeeds and stable for the session's lifetime; the slug SHALL be exposed only to the session's parties. Tokens SHALL be issued only to the session's two parties by the join action, inside the join window; an administrator or any other user requesting a token SHALL receive not-found. The token SHALL grant joining, publishing, and subscribing in that single room only, and SHALL NOT grant room creation or data publishing.

#### Scenario: Party receives a scoped token on join
- **WHEN** the coach of a video-analysis session performs the join action inside the join window
- **THEN** the response contains an access token whose identity is the coach's user id, whose room is the session's room name, and which expires within 10 minutes

#### Scenario: Room details do not admit without a token
- **WHEN** someone who knows a session's room name attempts to connect to the video server without a token issued for that room
- **THEN** the video server rejects the connection

#### Scenario: Admin cannot obtain a token
- **WHEN** an administrator performs the join action on a session they are not a party of
- **THEN** the request yields not-found and no token is issued

#### Scenario: Room name not guessable
- **WHEN** a session's room is provisioned at payment time
- **THEN** its room name contains a cryptographically random slug that appears in no public or third-party-accessible response

### Requirement: Native call UI in the session room
The session room page SHALL render the video call natively (no third-party iframe or externally hosted UI) using the platform's design system. Inside the join window the page SHALL first present a pre-join panel with a local camera preview, camera and microphone device selection, and mute toggles, and SHALL connect only when the party explicitly joins. During the call the page SHALL show the counterpart's video (or their screen share when active) as the main tile, the party's own video as a secondary tile, controls for microphone, camera, screen share (where the browser supports it), and leaving the call, a connection-quality/reconnecting indicator, and a waiting state naming the counterpart until they connect. Leaving SHALL disconnect the call and offer rejoining, which performs a new join.

#### Scenario: Pre-join before connecting
- **WHEN** a party opens the session room during the join window
- **THEN** they see their camera preview and device controls and are not yet connected to the call until they choose to join

#### Scenario: Counterpart not yet present
- **WHEN** a party joins the call before the other party has connected
- **THEN** the main tile shows a waiting state naming the counterpart, and their own preview remains visible

#### Scenario: Screen share takes the main tile
- **WHEN** the coach starts a screen share during the call
- **THEN** the player's main tile switches to the shared screen while the coach's camera moves to a secondary tile

#### Scenario: Leave and rejoin
- **WHEN** a party leaves the call and then chooses to rejoin
- **THEN** the call disconnects, a new join is performed, and they reconnect with a fresh token

### Requirement: Side-by-side attached video for video-analysis sessions
For `video_analysis` sessions, the session room SHALL present the session's attached video player alongside the call for both parties, using the existing per-session playback access (the session coach is admitted to the attached video's playback URL). On narrow viewports the layout SHALL stack. Sessions of other service types SHALL NOT show a video panel.

#### Scenario: Coach sees the video next to the call
- **WHEN** the coach joins the room of a video-analysis session
- **THEN** the attached video is playable side by side with the call

#### Scenario: Consultation room has no video panel
- **WHEN** a party joins the room of a consultation session
- **THEN** only the call is shown, with no video player panel

### Requirement: Attendance logging
The system SHALL record an attendance entry (user, session, join time) each time a party performs the join action during the join window, and SHALL enrich it with connection evidence reported by the video provider: the time the participant actually connected to the room and the time they left. Provider reports SHALL be accepted only when their authenticity is verified (signed by the provider with the platform's provider credentials); reports for unknown rooms or participants SHALL be ignored without error. Processing SHALL be idempotent so that repeated delivery of the same report does not alter the record. A connection report with no matching open entry SHALL create an entry carrying both join and connection times. Attendance entries SHALL be retained per session as evidence for later confirmation and dispute handling, repeated joins SHALL each be recorded, and the dispute view SHALL present join, connection, and leave times. Attendance SHALL NOT drive session status transitions.

#### Scenario: Join is logged
- **WHEN** a party performs the join action during the join window
- **THEN** an attendance entry with their identity and join time is recorded for the session

#### Scenario: Connection and leave stamped from provider reports
- **WHEN** the provider reports that the participant connected and later left the room
- **THEN** the party's open attendance entry gains the connection time and then the leave time

#### Scenario: Duplicate report is harmless
- **WHEN** the provider delivers the same connection report twice
- **THEN** the attendance record is unchanged by the second delivery

#### Scenario: Unsigned report rejected
- **WHEN** a request reaches the provider report endpoint without a valid provider signature
- **THEN** it is rejected as unauthorized and no attendance data changes

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
The session room page — countdown/closed states, pre-join panel, call controls and states, video panel, venue block for game sessions — SHALL render from next-intl catalogs in all five locales with no hard-coded strings, and SHALL show session times in the viewer's timezone.

#### Scenario: Localized room page
- **WHEN** a party opens the session room in any supported locale
- **THEN** all room UI strings, including pre-join and in-call controls, render from that locale's catalog
