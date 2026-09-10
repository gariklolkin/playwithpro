## MODIFIED Requirements

### Requirement: One-command local environment
The project SHALL provide a local development environment started with a single command (`tilt up`) that brings up the web app, API, PostgreSQL, S3-compatible storage (MinIO), a local SMTP catcher, and a single self-hosted video media server (LiveKit) in development-key mode with a media path that works on the developer machine without host UDP forwarding (ICE over TCP).

#### Scenario: Fresh developer setup
- **WHEN** a developer clones the repository, installs dependencies, and runs `tilt up`
- **THEN** the web app responds on port 3000, the API health check on port 4000 reports `ok` including database connectivity, MinIO/Mailpit consoles are reachable, and the media server accepts signaling on port 7880

#### Scenario: Local call works without UDP
- **WHEN** two browser tabs on the developer machine join the same session room
- **THEN** audio and video flow between them over the media server's TCP fallback port with no relay container involved

#### Scenario: Live reload
- **WHEN** a developer edits source code in `apps/web` or `apps/api`
- **THEN** the corresponding service reloads automatically without restarting the whole environment

### Requirement: Environment configuration
All service configuration SHALL be provided via environment variables documented in `.env.example`; secrets SHALL never be committed. The video provider configuration SHALL consist of the public signaling URL handed to browsers and an API key/secret pair shared between the API (token minting, webhook verification) and the media server; the development defaults SHALL point at the compose media server with its development keys.

#### Scenario: Missing required variable
- **WHEN** the API starts without a required environment variable
- **THEN** it fails fast at boot with a validation error naming the missing variable

#### Scenario: Provider credentials shared from one source
- **WHEN** the production secrets are applied from the operator's env file
- **THEN** the API and the media server receive the same key/secret pair without either value being committed
