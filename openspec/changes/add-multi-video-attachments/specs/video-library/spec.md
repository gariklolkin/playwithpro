## ADDED Requirements

### Requirement: Per-account library quota
The system SHALL cap each account's library by total stored size and by number of videos from platform configuration (`LIBRARY_MAX_TOTAL_GB`, default 10; `LIBRARY_MAX_VIDEOS`, default 20). Upload initiation SHALL be refused when the declared file size would exceed the size cap or the count cap is reached, with a machine-readable reason localized in the UI. Rejected videos SHALL NOT count; in-flight uploads SHALL count with their declared size.

#### Scenario: Quota reached by size
- **WHEN** an amateur with 9.5 GB stored initiates a 1 GB upload under a 10 GB cap
- **THEN** initiation is refused, no record is created, and the UI explains the remaining 0.5 GB

#### Scenario: Quota reached by count
- **WHEN** an amateur with 20 non-rejected videos initiates another upload under a 20-video cap
- **THEN** initiation is refused and the UI explains the count cap

#### Scenario: Deleting frees quota
- **WHEN** the owner deletes a 2 GB video
- **THEN** the next initiation counts 2 GB less against the cap

### Requirement: Limits visible before upload
The library and upload pages SHALL show the per-file limits (maximum size and duration), the account quota with current usage, and the per-session attachment caps before a file is chosen, and SHALL refuse client-side a file larger than the per-file size limit without starting an upload.

#### Scenario: Upload page shows limits
- **WHEN** an amateur opens the upload page
- **THEN** it shows the maximum file size and duration and the remaining library quota above the drop zone

#### Scenario: Oversized file refused locally
- **WHEN** an amateur drops a file larger than the maximum size
- **THEN** the page refuses it with the limit named and no upload is initiated

### Requirement: Unattached video retention
A `ready` video that is not attached to any live session (a session that is not cancelled or expired) SHALL be deleted by a daily sweep once it has been unattached for longer than the configured retention (`VIDEO_UNATTACHED_RETENTION_DAYS`, default 90). The unattached period SHALL start when the video becomes ready or when its last live attachment goes away, and SHALL reset when the video is attached. The library SHALL show the expiry date on videos whose period is running.

#### Scenario: Expiry shown in the library
- **WHEN** a video became ready 10 days ago and was never attached, with a 90-day retention
- **THEN** the library shows it expiring in 80 days

#### Scenario: Attachment stops the clock
- **WHEN** the owner attaches that video to a booking
- **THEN** the library no longer shows an expiry for it

#### Scenario: Expired video swept
- **WHEN** a video has been unattached for longer than the retention period
- **THEN** the sweep removes its record and stored objects, and the owner's library no longer lists it

## MODIFIED Requirements

### Requirement: Per-session coach access to attached video
The system SHALL grant the coach party of a session read and playback access (metadata and short-lived pre-signed playback URL) to every video in that session's attachment set, from the moment the session reaches `paid_escrow` and for later non-cancelled states. This access SHALL be scoped strictly to sessions the coach is a party of: library listing, rename, delete, and original download remain owner-only, and an unpaid or cancelled session grants no access. Removing a video from a session's set SHALL end the coach's access to it unless another qualifying session attaches it.

#### Scenario: Coach plays a clip of a paid session
- **WHEN** the coach of a `paid_escrow` video-analysis session requests playback of any clip in its set
- **THEN** the system returns the video metadata and a short-lived pre-signed playback URL

#### Scenario: Unpaid session grants nothing
- **WHEN** a coach requests a clip attached to their session still in `pending_payment`
- **THEN** the request yields not-found

#### Scenario: No session, no access
- **WHEN** a coach requests a video not attached to any of their sessions
- **THEN** the request yields not-found

#### Scenario: Removed clip loses access
- **WHEN** the player removes a clip from the set of a paid session and no other paid session of that coach attaches it
- **THEN** the coach's next playback request for it yields not-found

#### Scenario: Management stays owner-only
- **WHEN** the coach of a paid session attempts to rename, delete, or download the original of an attached video
- **THEN** the request is denied without revealing whether the video exists (forbidden for coach-inaccessible operations or not-found)
