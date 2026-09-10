# production-deploy Specification

## Purpose
Production/staging deployment of the platform on a single-node k3s cluster: public HTTPS endpoints, object storage and SMTP backing services, migration-gated rollouts, media-server network layout, database backups, operator scripts, and secret handling.

## Requirements

### Requirement: Public HTTPS endpoints
The platform SHALL be reachable at `https://play-with.pro` (web, with `www` redirecting to the apex), `https://api.play-with.pro` (API), and `https://meet.play-with.pro` (LiveKit signaling), each serving a valid Let's Encrypt certificate that renews automatically.

#### Scenario: Web and API served over TLS
- **WHEN** a browser opens `https://play-with.pro` or the web app calls `https://api.play-with.pro`
- **THEN** the request is served over HTTPS with a currently valid certificate and no mixed-content warnings

#### Scenario: HTTP redirects to HTTPS
- **WHEN** a client requests any of the hostnames over plain HTTP
- **THEN** it receives a redirect to the HTTPS origin

### Requirement: Single-node Kubernetes deployment
The production stack (web, api, PostgreSQL, the LiveKit media server) SHALL run as Kubernetes workloads on a single k3s node, declared by manifests in the repository, with the api limited to exactly one replica while playback-sync state is in-memory.

#### Scenario: Cluster reachable from the operator's machine
- **WHEN** the operator runs `kubectl get pods` from their Mac using the copied kubeconfig
- **THEN** the command lists the production workloads without requiring an SSH session

#### Scenario: Deployment is reproducible
- **WHEN** the deploy script is run from a clean checkout against an empty cluster with a valid secrets env-file
- **THEN** all workloads reach Ready state without manual kubectl edits

### Requirement: Object storage for video content
The api SHALL use an S3-compatible Hetzner Object Storage bucket for all video and avatar storage in production, configured purely through environment variables, with no MinIO deployment in the production cluster.

#### Scenario: Video upload round-trip
- **WHEN** a player uploads a video through the production web app
- **THEN** the object lands in the Hetzner bucket via pre-signed URLs and plays back in the session room from the same bucket

### Requirement: Production email delivery
The api SHALL send transactional email (signup verification codes, .ics session invites, cancellations) through a real SMTP provider configured via environment variables.

#### Scenario: Signup code arrives
- **WHEN** a new user registers on the production site
- **THEN** the 6-digit verification code is delivered to their real mailbox

### Requirement: Database migrations precede rollout
Every deploy SHALL apply pending Prisma migrations to the production database and complete them successfully before new application images start serving traffic.

#### Scenario: Failed migration blocks rollout
- **WHEN** the migration step fails during a deploy
- **THEN** the previously running application versions keep serving and the deploy aborts with the migration error surfaced to the operator

### Requirement: Production media server over HTTPS
The LiveKit media server SHALL serve signaling at `https://meet.play-with.pro` (TLS at the ingress) with WebRTC media flowing through the host's public IP (muxed UDP 7882, ICE over TCP 7881 as fallback, embedded TURN on 3478/5349 with the ingress certificate), used by the session room page on its real secure origin.

#### Scenario: Cross-browser 1:1 call
- **WHEN** the two session parties join a video-analysis room from different browsers (including Firefox and Safari) on different networks
- **THEN** both see and hear each other with media flowing via the public IP (direct UDP or TURN fallback)

### Requirement: Database backups leave the host
A scheduled job SHALL dump the production database at least daily and store the dump in the Object Storage bucket.

#### Scenario: Nightly dump present
- **WHEN** the operator lists backup objects after a deploy has been live over a night
- **THEN** a dump object from the last 24 hours exists in the bucket

### Requirement: Operational scripts work against the cluster
The join-window override (`room-window.sh`) and the smoke-session seed script SHALL work against the production cluster from the operator's machine, targeting the in-cluster database via kubectl.

#### Scenario: Forcing a room open in production
- **WHEN** the operator runs the k8s variant of `room-window.sh open` for a paid online session
- **THEN** the session's room becomes joinable immediately and `close` reverts it

#### Scenario: Seeding a smoke session
- **WHEN** the operator runs the seed script against the cluster
- **THEN** smoke player/coach accounts and a paid video-analysis session with an attached fixture video exist and can enter the room

### Requirement: Secrets stay out of the repository
Production credentials (database, S3, SMTP, JWT, OAuth) SHALL exist only as Kubernetes Secrets created from an operator-local env file; the repository SHALL contain no production secret values.

#### Scenario: Repo scan is clean
- **WHEN** the repository is searched for production credential values after the change is implemented
- **THEN** none are found in tracked files
