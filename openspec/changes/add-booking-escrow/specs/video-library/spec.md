## ADDED Requirements

### Requirement: Per-session coach access to attached video
The system SHALL grant the coach party of a session read and playback access (metadata and short-lived pre-signed playback URL) to the video attached to that session, from the moment the session reaches `paid_escrow` and for later non-cancelled states. This access SHALL be scoped strictly to sessions the coach is a party of: library listing, rename, delete, and original download remain owner-only, and an unpaid or cancelled session grants no access.

#### Scenario: Coach plays the attached video of a paid session
- **WHEN** the coach of a `paid_escrow` video-analysis session requests playback of the attached video
- **THEN** the system returns the video metadata and a short-lived pre-signed playback URL

#### Scenario: Unpaid session grants nothing
- **WHEN** a coach requests the video attached to their session still in `pending_payment`
- **THEN** the request yields not-found

#### Scenario: No session, no access
- **WHEN** a coach requests a video not attached to any of their sessions
- **THEN** the request yields not-found

#### Scenario: Management stays owner-only
- **WHEN** the coach of a paid session attempts to rename, delete, or download the original of the attached video
- **THEN** the request is denied without revealing whether the video exists (forbidden for coach-inaccessible operations or not-found)
