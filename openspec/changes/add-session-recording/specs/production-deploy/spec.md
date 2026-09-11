## ADDED Requirements

### Requirement: Recording services beside the media server
The production cluster SHALL run a Redis instance and the media server's egress service beside the media server, with the media server configured to use that Redis. The egress service SHALL write recordings directly to the platform's object storage under a dedicated `recordings/` prefix using credentials rendered from the operator's secrets file, SHALL have resource requests sized for one concurrent composite recording, and its concurrency SHALL be capped by the API's `RECORDING_MAX_CONCURRENT` setting. The retirement runbook SHALL cover both services.

#### Scenario: Recording lands in object storage
- **WHEN** a recording completes on production
- **THEN** the file exists under the `recordings/` prefix of the production bucket and the API receives the provider's completion report

#### Scenario: Second recording refused by cap
- **WHEN** a second session would start recording while one runs on the single node
- **THEN** the API cancels it for capacity and the running recording is unaffected
