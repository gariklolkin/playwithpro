# Design: add-player-profiles

## Context

Amateurs have only account basics (`User`: displayName, locale, timezone). Coaches already have `ProProfile` with a draft-on-first-access pattern, role-guarded `/pros/me/*` endpoints, and a `/dashboard/profile` page. No user in the system has an avatar, and nothing uses S3 yet, although MinIO runs in Tilt and `minio-bootstrap` already creates a `playwithpro-videos` bucket with anonymous download enabled.

This change adds a player profile for amateurs and an account-level avatar for everyone, establishing the pre-signed-upload pattern that `add-video-upload` will reuse.

## Goals / Non-Goals

**Goals:**
- 1:1 `PlayerProfile` for amateurs with playing details, mirroring the existing pro-profile conventions (draft on first access, role guards, self endpoints).
- Account-level avatar (any role) stored in S3-compatible storage via pre-signed PUT, with a reusable `StorageModule` in the API.
- Read-only player card available to coaches/admins for later use in booking and session screens.

**Non-Goals:**
- Video upload (change 6) — but the storage service is written so it can issue video upload URLs later.
- Public coach catalog surfacing of avatars (later catalog change).
- Image processing (crop/resize/thumbnails) — the client uploads a reasonable image; processing can be added later without API changes.

## Decisions

1. **Avatar lives on `User` (`avatarKey String?`), not on `PlayerProfile`.**
   Coaches need avatars too (catalog, session rooms). Alternative — player-only avatar — was rejected as it would need re-plumbing in the next change. The API exposes a computed `avatarUrl`, never the raw key.

2. **Reuse the existing bucket with key prefixes** (`avatars/<userId>/<uuid>.<ext>`), rather than a second bucket.
   The bootstrap bucket already has anonymous download; avatars are public-by-design content. One bucket keeps local/prod config to a single `S3_BUCKET` env var. The `-videos` name is cosmetic; prod can name it differently via env.

3. **Two-step upload flow**: `POST /users/me/avatar/upload-url` (validates content type/size, returns pre-signed PUT + key) → browser PUTs directly to storage → `PUT /users/me/avatar` confirms with the key (server verifies the object exists via HEAD before attaching). Alternative — proxying bytes through the API — rejected: the whole point is to establish the direct-to-S3 pattern for videos.
   Old avatar object is deleted on replace/remove (best-effort).

4. **New `StorageModule`** (`storage/`) wrapping `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, configured from env (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, credentials, `S3_PUBLIC_URL` for browser-facing links since the in-cluster endpoint `http://minio:9000` differs from the host-visible one, e.g. `http://localhost:9000`). Pre-signed URLs must be signed against the public endpoint so browser PUTs work.

5. **`PlayerProfile` model**: `id`, `userId @unique`, `level PlayerLevel` (enum BEGINNER/INTERMEDIATE/ADVANCED/COMPETITIVE, default BEGINNER), `style PlayingStyle?` (OFFENSIVE/ALL_ROUND/DEFENSIVE — owner feedback: more telling for coaches than hand/grip), `yearsOfExperience Int?`, `handedness Handedness?` (LEFT/RIGHT), `grip Grip?` (SHAKEHAND/PENHOLD), `about String @default("")`, timestamps. Created on first `GET /players/me` (same pattern as pro profile). The editor's Save button uses the same dirty-state pattern as the availability editor (disabled until the form differs from the last saved state).

6. **Endpoints**: `players` module — `GET/PATCH /players/me` (amateur-only guard), `GET /players/:id` (professional/admin guard). `users` module gains the avatar endpoints (avatar is an account concern, not a player concern).

7. **Web routing**: reuse `/dashboard/profile` — the page already exists for coaches; it renders role-appropriate content (amateur → player profile editor with avatar + stubbed "My videos"/"My sessions" sections). Avatar uploader also appears in `/settings/account` for all roles. Player card is a shared component (`PlayerCard`) consumed later by booking/session screens.

## Risks / Trade-offs

- [Pre-signed PUT from browser blocked by CORS] → MinIO allows `*` origins by default; document `MINIO_API_CORS_ALLOW_ORIGIN` and verify in e2e; prod S3 needs a CORS rule on the bucket (noted in env docs).
- [Orphaned objects if user uploads but never confirms] → keys are namespaced per user and small; acceptable for MVP, lifecycle cleanup can come with video upload.
- [Public-read avatars] → acceptable: avatars are public identity by design; no PII in keys (uuid names).
- [Client-declared content type/size can lie] → pre-signed URL pins `Content-Type` and confirm-step HEAD checks `ContentLength` ≤ 5 MB; mismatches are rejected.

## Migration Plan

Prisma migration adds `PlayerProfile` + enums + `User.avatarKey` — additive, no backfill, safe rollback (drop). Env additions to `.env.example` and Tilt; no changes to existing bootstrap.

## Open Questions

- None blocking. Prod bucket naming/CDN in front of S3 is deferred to deployment work.
