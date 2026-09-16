## ADDED Requirements

### Requirement: Observability configuration contract
The production env contract SHALL document the observability variables — client key and proxy path as web build args, server keys, the support identity secret, replay sampling — and every variable SHALL be optional with a silent default, so a build or deployment without them sends nothing.

#### Scenario: Unset in CI
- **WHEN** images are built and tests run without observability variables
- **THEN** builds succeed and no ingestion request is attempted

### Requirement: Source maps uploaded at image build
The production image builds SHALL inject release metadata and upload source maps for web and API to the vendor using a build-time secret that is not baked into the image, tagged with the deploy SHA.

#### Scenario: Release matches the image tag
- **WHEN** the operator deploys a SHA
- **THEN** errors from that deployment show the same SHA as release and resolve to source lines

### Requirement: Same-origin ingestion proxy
The web server SHALL proxy the analytics ingestion and asset paths under a first-party path on `play-with.pro`, so browser capture is not blocked by tracker blocklists and no third-party host is contacted directly from the page.

#### Scenario: Ingestion goes through the app origin
- **WHEN** a consenting browser sends events
- **THEN** the requests go to the app origin and are forwarded to the vendor's EU ingestion host

## MODIFIED Requirements

### Requirement: Secrets stay out of the repository
Production credentials (database, S3, SMTP, JWT, OAuth, observability and support-identity keys) SHALL exist only as Kubernetes Secrets created from an operator-local env file, or as build-time secrets passed to the image build; the repository SHALL contain no production secret values.

#### Scenario: Repo scan is clean
- **WHEN** the repository is searched for production credential values after the change is implemented
- **THEN** none are found in tracked files
