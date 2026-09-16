## ADDED Requirements

### Requirement: Feedback board workload
The cluster SHALL run the feedback board as a Deployment with a pinned image version, its own PostgreSQL database and role in the existing instance that cannot connect to the application database, its configuration in a dedicated Secret rendered from the operator env file, outgoing mail through the same SMTP relay as the application, and resource requests and limits small enough that it cannot starve the application or the media server on the single node. Deploy, upgrade and restore steps SHALL be documented in the k8s README.

#### Scenario: Database isolation
- **WHEN** the board's database role attempts to connect to the application database
- **THEN** the connection is refused

#### Scenario: Board within limits
- **WHEN** the board is used normally over a day
- **THEN** its pod stays within its resource limits and application pods are unaffected

## MODIFIED Requirements

### Requirement: Public HTTPS endpoints
The platform SHALL be reachable at `https://play-with.pro` (web, with `www` redirecting to the apex), `https://api.play-with.pro` (API), `https://meet.play-with.pro` (LiveKit signaling), and `https://feedback.play-with.pro` (feedback board), each serving a valid Let's Encrypt certificate that renews automatically.

#### Scenario: Web and API served over TLS
- **WHEN** a browser opens `https://play-with.pro` or the web app calls `https://api.play-with.pro`
- **THEN** the request is served over HTTPS with a currently valid certificate and no mixed-content warnings

#### Scenario: HTTP redirects to HTTPS
- **WHEN** a client requests any of the hostnames over plain HTTP
- **THEN** it receives a redirect to the HTTPS origin

#### Scenario: Feedback board served over TLS
- **WHEN** a browser opens `https://feedback.play-with.pro`
- **THEN** the board is served with a valid production certificate

### Requirement: Database backups leave the host
A scheduled job SHALL dump the production application database and the feedback-board database at least daily and store the dumps in the Object Storage bucket.

#### Scenario: Nightly dump present
- **WHEN** the operator lists backup objects after a deploy has been live over a night
- **THEN** a dump object from the last 24 hours exists in the bucket for each database
