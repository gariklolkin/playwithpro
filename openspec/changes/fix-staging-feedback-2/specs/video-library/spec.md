## MODIFIED Requirements

### Requirement: Upload completion and validation
On completion the system SHALL finalize the S3 multipart upload, verify the stored object size against the configured maximum, and move the video to `processing`. A server-side worker SHALL then probe the file with ffprobe: it MUST contain a video stream and its duration MUST NOT exceed the configured maximum (`VIDEO_MAX_DURATION_MIN`, default 30). Valid videos SHALL have codec, container, duration, resolution, and frame rate persisted and reach `ready`; invalid ones SHALL be marked `rejected` with a reason and their stored objects deleted. The persisted resolution SHALL be the displayed one: when the stream carries a quarter-turn rotation (display-matrix side data or a `rotate` tag of ±90° / 270°), width and height SHALL be swapped so that phone footage recorded upright is stored as portrait.

#### Scenario: Valid video becomes ready
- **WHEN** a completed upload probes as a video within the duration limit
- **THEN** its metadata (codec, container, duration, width, height, fps) is persisted and status becomes `ready`

#### Scenario: Rotated phone footage
- **WHEN** a completed upload probes as a 1920×1080 stream with a display-matrix rotation of −90°
- **THEN** the persisted resolution is 1080×1920

#### Scenario: Not a playable video file
- **WHEN** the uploaded object contains no video stream
- **THEN** status becomes `rejected` with a reason and the object is deleted from storage

#### Scenario: Over duration limit
- **WHEN** the probed duration exceeds the configured maximum
- **THEN** status becomes `rejected` with a reason and the object is deleted from storage

#### Scenario: Recovery after restart
- **WHEN** the API restarts while videos are in `processing`
- **THEN** their processing is re-run automatically on startup
