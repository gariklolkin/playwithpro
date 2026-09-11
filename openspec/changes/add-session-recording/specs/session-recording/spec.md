## ADDED Requirements

### Requirement: Recording add-on at booking
For online services (`consultation`, `video_analysis`) of a coach who allows recording, the booking flow SHALL offer a "record this session" add-on priced as a configurable percentage of the service price (`RECORDING_ADDON_PERCENT`, default 15) in the service currency, rounded to minor units. Choosing it SHALL record the player's booking-time consent with the current consent text version, and SHALL add the amount to the session price snapshot as a separate add-on field; the add-on SHALL NOT change the coach's payout. The add-on SHALL be rejected for in-person sessions and for coaches who do not allow recording.

#### Scenario: Add-on priced and snapshotted
- **WHEN** a player books a €40 consultation with the recording add-on at 15%
- **THEN** the session snapshots a €6 add-on, the payable total is €46, and the platform fee snapshot equals the fee on €40 plus €6

#### Scenario: Coach does not allow recording
- **WHEN** a player attempts to book with the add-on for a coach whose profile has recording disabled
- **THEN** the booking is rejected with a validation error and no session is created

#### Scenario: In-person session
- **WHEN** a booking for the `game` service includes the add-on
- **THEN** the booking is rejected with a validation error

### Requirement: Two-sided consent before any recording
A session SHALL be recorded only when both parties have confirmed on the pre-join panel of that session, each confirmation stored with the user, time, and consent text version. The pre-join panel of a session with the add-on SHALL show the consent text and require confirmation to join; declining SHALL still allow joining without recording and SHALL be stored as a withdrawal. Either party SHALL be able to withdraw consent before the session starts from the session view. A withdrawal SHALL cancel the recording for the session; cancellation SHALL NOT be reversible for that session.

#### Scenario: Both confirm, recording proceeds
- **WHEN** the player and the coach each confirm the consent text on pre-join and both connect
- **THEN** the recording starts and both confirmations are stored with the text version

#### Scenario: Coach declines at pre-join
- **WHEN** the coach declines on the pre-join panel
- **THEN** the coach joins the call unrecorded, the recording is cancelled with the withdrawal stored, and the player sees a notice that the session will not be recorded

#### Scenario: Player withdraws before start
- **WHEN** the player withdraws consent from the session view an hour before the session
- **THEN** the recording is cancelled and the coach's session view reflects it

### Requirement: Recording lifecycle through the video provider
The system SHALL start and stop recordings only through the `VideoProvider` abstraction. A recording SHALL be started once both parties are connected to the room and both consents exist, SHALL stop when either party uses the stop control, when the session's join window closes, or when the room empties, and SHALL NOT be restarted within the same session once stopped. Provider reports (authenticated like attendance reports) SHALL move the recording through `requested → recording → processing → ready | failed | cancelled`, storing the provider reference, timing, duration, size, and object key. Processing SHALL be idempotent under repeated report delivery.

#### Scenario: Start when both connected
- **WHEN** the second consented party connects to the room
- **THEN** a recording is started through the provider and its status becomes `recording` when the provider confirms

#### Scenario: Party stops the recording
- **WHEN** the player activates the stop control mid-session
- **THEN** the provider is asked to stop, the stop is stored with the user and time, and the recording moves to `processing` then `ready`

#### Scenario: Window closes
- **WHEN** the join window closes while a recording is running
- **THEN** the recording is stopped

#### Scenario: Provider failure
- **WHEN** the provider reports the recording failed
- **THEN** the recording becomes `failed` and both parties see that no recording will be delivered

### Requirement: Recording capacity limit
The system SHALL cap concurrently running recordings (`RECORDING_MAX_CONCURRENT`, default 1). When a recording cannot be started because the cap is reached, it SHALL be cancelled with reason `capacity`, the call SHALL proceed unrecorded, and both parties SHALL see a notice.

#### Scenario: Cap reached
- **WHEN** a second recording would start while one is already running at a cap of 1
- **THEN** the second is cancelled with reason `capacity` and the call continues without recording

### Requirement: In-room recording indicator and control
While a recording is `recording`, the session room SHALL show a persistent recording indicator to both parties. The room SHALL show a stop control to both parties while recording, and status notices when the recording is waiting for the other party's consent, was cancelled, stopped, or failed.

#### Scenario: Indicator visible to both
- **WHEN** the recording is running
- **THEN** both parties' room pages show the recording indicator

#### Scenario: Waiting for the other party
- **WHEN** one party has confirmed and connected and the other has not yet
- **THEN** that party sees a notice that recording starts once the other party joins and confirms

### Requirement: Add-on refund when no recording is delivered
At settlement, when the session carried a recording add-on and the recording is not `ready`, the add-on amount SHALL be refunded to the player from the held payment while the coach's release amount stays unchanged. When the recording is `ready`, the add-on SHALL be retained by the platform. A full refund of the session (pre-start cancellation or dispute refund) SHALL include the add-on.

#### Scenario: Recording cancelled by capacity
- **WHEN** a €46 session (€6 add-on) settles after its recording was cancelled for capacity
- **THEN** €6 is refunded to the player, the coach receives the release on €40 minus the fee, and the ledger shows the partial refund

#### Scenario: Recording delivered
- **WHEN** the session settles with a `ready` recording
- **THEN** no partial refund occurs

### Requirement: Recording playback and ownership
Both parties SHALL be able to watch a `ready` recording from the session via a short-lived pre-signed URL; other users SHALL be denied. The player SHALL own the recording and SHALL be able to delete it before expiry, removing the stored object and marking the recording deleted; the coach SHALL NOT be able to delete or download it. Recordings SHALL expire after a configurable retention period (`RECORDING_RETENTION_DAYS`, default 90) from becoming ready, after which a sweep SHALL remove the object and mark the recording expired; the parties SHALL see the expiry date.

#### Scenario: Player watches
- **WHEN** the player opens the recording of a completed session
- **THEN** a pre-signed URL is issued and the recording plays

#### Scenario: Third party denied
- **WHEN** a signed-in user who is not a party requests the recording
- **THEN** the request is rejected as not found

#### Scenario: Player deletes early
- **WHEN** the player deletes the recording
- **THEN** the object is removed and both parties see it as deleted

#### Scenario: Expiry sweep
- **WHEN** a recording is older than the retention period
- **THEN** the sweep removes the object and marks the recording expired

### Requirement: Admin access limited to open disputes
Admins SHALL see recording metadata (status, consents, duration, expiry) in the dispute view but SHALL obtain a playback URL only while the session's dispute is `open`; each admin playback URL SHALL be logged with the admin, session, and time. Outside an open dispute admins SHALL have no access to the recording.

#### Scenario: Admin watches during an open dispute
- **WHEN** an admin requests the recording of a session whose dispute is open
- **THEN** a pre-signed URL is issued and an access log entry is stored

#### Scenario: Admin after resolution
- **WHEN** an admin requests the recording of a session whose dispute is resolved
- **THEN** the request is rejected

### Requirement: Video-analysis replay from audio and timeline
For `video_analysis` sessions, the recording SHALL capture the call's mixed audio only, and the system SHALL persist the session's playback timeline (each play, pause, and seek of the attached video with its wall-clock time) for the duration of the recording. The session review SHALL offer a replay mode in which the audio drives the clock, the attached video follows the recorded timeline, and annotations appear at the times they were drawn; the annotated-moment controls SHALL seek the replay to the first time that moment was on screen. Replay SHALL degrade to audio plus annotations when the attached video has been deleted.

#### Scenario: Replay follows the coach
- **WHEN** the player starts the replay of a video-analysis session
- **THEN** the attached video plays, pauses, and seeks as it did during the session while the coach's voice plays, and strokes appear when they were drawn

#### Scenario: Jump to a moment
- **WHEN** the player selects an annotated moment in replay mode
- **THEN** the replay seeks to the time that moment was first shown during the session

### Requirement: Localized recording experience and legal texts
All recording UI (booking add-on, consent panel, indicators, notices, playback, deletion, admin metadata) SHALL render from next-intl catalogs in all five locales. The consent text SHALL be versioned, and the terms and privacy policy pages SHALL describe the purpose, retention, admin access during disputes, and deletion of recordings in all five locales.

#### Scenario: Consent text version stored
- **WHEN** a party confirms consent in any locale
- **THEN** the stored consent carries the current consent text version
