## ADDED Requirements

### Requirement: Multipart upload initiation
The system SHALL let an authenticated amateur initiate a video upload by creating a video record and an S3 multipart upload, returning the identifiers the client needs to upload parts directly to storage. The system SHALL reject initiation when the client-reported file size exceeds the configured maximum (`VIDEO_MAX_SIZE_MB`, default 2048) or when the content type is not a video MIME type.

#### Scenario: Successful initiation
- **WHEN** an amateur submits a file name, size, and video content type within limits
- **THEN** the system creates a `Video` record in `uploading` status owned by that user and returns the video id, S3 upload id, and object key

#### Scenario: File too large
- **WHEN** the reported file size exceeds the configured maximum
- **THEN** the system returns a validation error and creates no record

#### Scenario: Not a video content type
- **WHEN** the reported content type is not `video/*`
- **THEN** the system returns a validation error and creates no record

### Requirement: Direct-to-storage part upload with resume
The system SHALL pre-sign upload-part URLs on demand for an in-flight upload so the browser uploads file parts directly to S3-compatible storage — in parallel, with per-part retry, and resumable after interruption. Part URLs SHALL be signed against the public storage endpoint and SHALL only be issued to the upload's owner.

#### Scenario: Signing part URLs
- **WHEN** the owner requests URLs for a batch of part numbers of their `uploading` video
- **THEN** the system returns a pre-signed PUT URL per requested part

#### Scenario: Resume after interruption
- **WHEN** an upload is interrupted and the client re-requests URLs for the missing parts only
- **THEN** the system signs them and the upload completes without re-uploading finished parts

#### Scenario: Foreign upload
- **WHEN** a user requests part URLs for a video they do not own
- **THEN** the system responds with not-found and signs nothing

### Requirement: Upload completion and validation
On completion the system SHALL finalize the S3 multipart upload, verify the stored object size against the configured maximum, and move the video to `processing`. A server-side worker SHALL then probe the file with ffprobe: it MUST contain a video stream and its duration MUST NOT exceed the configured maximum (`VIDEO_MAX_DURATION_MIN`, default 30). Valid videos SHALL have codec, container, duration, resolution, and frame rate persisted and reach `ready`; invalid ones SHALL be marked `rejected` with a reason and their stored objects deleted.

#### Scenario: Valid video becomes ready
- **WHEN** a completed upload probes as a video within the duration limit
- **THEN** its metadata (codec, container, duration, width, height, fps) is persisted and status becomes `ready`

#### Scenario: Not a playable video file
- **WHEN** the uploaded object contains no video stream
- **THEN** status becomes `rejected` with a reason and the object is deleted from storage

#### Scenario: Over duration limit
- **WHEN** the probed duration exceeds the configured maximum
- **THEN** status becomes `rejected` with a reason and the object is deleted from storage

#### Scenario: Recovery after restart
- **WHEN** the API restarts while videos are in `processing`
- **THEN** their processing is re-run automatically on startup

### Requirement: Original preservation for technique analysis
The system SHALL store the uploaded file byte-identical to what the client sent — no client-side re-encode or compression before upload and no lossy modification of the original afterward. The original SHALL remain stored for the lifetime of the video and SHALL be downloadable by its owner via a short-lived pre-signed URL that forces a file download.

#### Scenario: Original download
- **WHEN** the owner requests the download URL of a `ready` video
- **THEN** the system returns a short-lived pre-signed GET URL serving the unmodified original as an attachment

#### Scenario: Original untouched by processing
- **WHEN** processing produces a playback rendition
- **THEN** the original object remains stored unchanged alongside it

### Requirement: Browser playback for any source codec
The system SHALL guarantee in-browser playback of every `ready` video. When the source is already browser-safe (H.264 in MP4) the original SHALL serve as the playback file with no transcode; otherwise the worker SHALL transcode an H.264/AAC MP4 rendition capped at 1080p that preserves the source frame rate. Playback SHALL use a short-lived pre-signed GET URL supporting HTTP Range requests so seeking works.

#### Scenario: Browser-safe source
- **WHEN** the probed source is H.264 in an MP4 container
- **THEN** no rendition is created and the playback URL serves the original

#### Scenario: Non-browser-safe source
- **WHEN** the probed source is not browser-playable (e.g. HEVC in .mov)
- **THEN** the worker creates an H.264/AAC MP4 rendition preserving source fps and the playback URL serves the rendition

#### Scenario: Seeking during playback
- **WHEN** the owner seeks within the player
- **THEN** the video position changes without downloading the file from the start

### Requirement: Video library management
The system SHALL provide amateurs a library of their own videos: list with status and metadata, watch, rename, and delete. Deleting SHALL remove the database record and all stored objects, aborting the S3 multipart upload first when one is still in flight. All operations SHALL be restricted to the video owner.

#### Scenario: Listing own videos
- **WHEN** an amateur opens their video library
- **THEN** they see only their own videos with title, status, duration, resolution, size, and upload date

#### Scenario: Renaming
- **WHEN** the owner submits a new title for their video
- **THEN** the title is updated

#### Scenario: Deleting a ready video
- **WHEN** the owner deletes a `ready` video
- **THEN** the record and the original and rendition objects are removed from storage

#### Scenario: Deleting an in-flight upload
- **WHEN** the owner deletes a video still in `uploading` status
- **THEN** the S3 multipart upload is aborted and the record removed

### Requirement: Processing status visibility
The system SHALL expose the upload lifecycle `uploading → processing → ready | rejected` per video, and the library UI SHALL reflect it: upload progress while uploading, a processing indicator, playability when ready, and the rejection reason when rejected.

#### Scenario: Processing indicator
- **WHEN** a video is in `processing`
- **THEN** the library shows it as processing and does not offer playback

#### Scenario: Rejection surfaced
- **WHEN** a video is `rejected`
- **THEN** the library shows the localized rejection reason

### Requirement: Localized upload experience with quality guidance
The upload UI SHALL be available in all five locales (en, fr, de, ru, zh) with no hard-coded strings, SHALL support drag-and-drop with per-file progress, and SHALL display recording guidance that frame rate matters for technique analysis (recommend 1080p at 60 fps), without rejecting lower-quality footage.

#### Scenario: Localized upload page
- **WHEN** a user opens the upload page in any supported locale
- **THEN** all copy, including the quality guidance, renders from the message catalog for that locale

#### Scenario: Low-quality footage accepted
- **WHEN** a user uploads footage below the recommended resolution or frame rate
- **THEN** the upload proceeds normally

### Requirement: Stale upload cleanup
The system SHALL periodically abort S3 multipart uploads and delete video records that have remained in `uploading` status longer than 24 hours.

#### Scenario: Abandoned upload swept
- **WHEN** the daily cleanup runs and finds a video in `uploading` older than 24 hours
- **THEN** its multipart upload is aborted and the record deleted
