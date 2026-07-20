## 1. Infrastructure & data model

- [x] 1.1 Add ffmpeg/ffprobe to the API dev image; verify binaries resolve inside the Tilt container
- [x] 1.2 Add config: `VIDEO_MAX_SIZE_MB` (default 2048), `VIDEO_MAX_DURATION_MIN` (default 30) with validation
- [x] 1.3 Prisma: `Video` model (owner, title, status enum `uploading|processing|ready|rejected`, originalKey, playbackKey?, s3UploadId?, sizeBytes?, durationSeconds?, width?, height?, fps?, codec?, container?, rejectionReason?, timestamps) + migration

## 2. Storage multipart support

- [x] 2.1 Extend `StorageService`: `createMultipartUpload`, `presignUploadPart` (public-endpoint signing, 1 h expiry), `completeMultipartUpload`, `abortMultipartUpload`
- [x] 2.2 Extend `StorageService`: `presignGet` with optional `response-content-disposition` (attachment + filename) for playback/download URLs
- [x] 2.3 Unit tests for the new storage methods (mocked S3 client)

## 3. Videos API module

- [x] 3.1 `VideosModule` scaffold; DTOs with class-validator; owner-scoped guards (amateur role)
- [x] 3.2 `POST /videos` — limit/MIME validation, create `uploading` record, initiate multipart, return `{videoId, uploadId, key}`
- [x] 3.3 `POST /videos/:id/parts` — batch pre-sign part URLs for owner's in-flight upload
- [x] 3.4 `POST /videos/:id/complete` — complete multipart, HEAD size re-check, transition to `processing`, enqueue processing job
- [x] 3.5 `GET /videos`, `GET /videos/:id` — library list/detail with status + metadata
- [x] 3.6 `PATCH /videos/:id` (rename), `DELETE /videos/:id` (abort in-flight multipart, delete objects + record)
- [x] 3.7 `GET /videos/:id/playback-url`, `GET /videos/:id/download-url` — short-lived pre-signed GETs (`ready` only)
- [x] 3.8 Unit tests: initiation limits, ownership checks, complete flow, delete variants

## 4. Processing worker

- [x] 4.1 In-process processing service: concurrency-limited (1–2) fire-and-forget pipeline driven by DB status
- [x] 4.2 ffprobe step: probe via pre-signed URL (fallback: tmp download), reject non-video/over-duration (delete objects, persist reason), persist metadata
- [x] 4.3 Playback decision + ffmpeg transcode: H.264/AAC MP4, cap 1080p, preserve fps, `+faststart`; skip when source is H.264/MP4 (playbackKey = originalKey); mark `ready`
- [x] 4.4 Startup recovery: re-queue videos stuck in `processing` on module init
- [x] 4.5 Daily stale-upload sweep (`@nestjs/schedule`): abort multipart + delete `uploading` records older than 24 h
- [x] 4.6 Unit tests: probe rejection paths, transcode-vs-skip decision, recovery, sweep

## 5. Web: upload & library

- [x] 5.1 Add `@uppy/core`, `@uppy/aws-s3`, `@uppy/react`; wire Uppy multipart callbacks to the four API endpoints
- [x] 5.2 Upload page: drag-and-drop, per-file progress, retry/resume behavior, quality guidance banner (1080p/60fps)
- [x] 5.3 Library page: list with status badges (uploading/processing/ready/rejected + localized rejection reason), rename, delete with confirm
- [x] 5.4 Video detail/watch page: `<video>` player over pre-signed playback URL (seek must work), metadata display, "Download original" action
- [x] 5.5 Message catalog entries for en/fr/de/ru/zh; no hard-coded strings
- [x] 5.6 Navigation entry for amateurs; empty-state for the library
- [x] 5.7 Profile "My videos" stub → live summary (recent uploads + link to library); delta spec for `player-profiles`

## 6. Verification

- [x] 6.1 E2E happy path against Tilt: initiate → parallel part upload → complete → processing → ready → playback + download
- [x] 6.2 Manual checks: HEVC .mov (transcode path), H.264 mp4 (skip path), oversized file rejection, mid-upload interrupt + resume, delete in-flight upload
- [x] 6.3 `openspec validate add-video-upload`; lint, typecheck, tests green in CI
