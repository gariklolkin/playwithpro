## ADDED Requirements

### Requirement: Local recording pipeline
The local environment SHALL include Redis and the media server's egress service, configured against the local media server and MinIO, so a recording can be produced and played end-to-end on a developer machine without external services.

#### Scenario: Local recording end to end
- **WHEN** a developer records a dev session with two browsers
- **THEN** the egress service writes the file to the local MinIO bucket and the recording becomes `ready` in the API
