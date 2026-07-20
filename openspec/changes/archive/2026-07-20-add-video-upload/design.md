## Context

Video analysis is the core service: amateurs upload game footage that pros later review live. `add-player-profiles` introduced `StorageModule` — a thin S3 wrapper (single pre-signed PUT, HEAD, DELETE) used for 512×512 avatars. Videos are a different beast: files of hundreds of MB to a few GB, uploaded over flaky residential/mobile networks, and the footage must stay sharp enough for frame-by-frame technique analysis. The booking change (`add-booking-escrow`) will attach videos from this library to `video_analysis` sessions, so the library must exist first.

Constraints:
- MinIO locally / AWS S3 in prod; API signs against `S3_PUBLIC_URL` so browser talks to storage directly (established pattern).
- No queue infrastructure (Redis/BullMQ) exists yet; Tilt dev env should stay lean.
- Session-lifecycle and payments are out of scope here.

## Goals / Non-Goals

**Goals:**
- Reliable upload of large originals: parallel, resumable, with real progress, straight to S3.
- Preserve analysis quality: never re-encode on the client; keep the original forever; expose it for download.
- Every video plays in the browser regardless of source codec (iPhone HEVC included).
- Self-service library for amateurs: list, watch, rename, delete, see processing status.
- Enforceable limits (size, duration) so storage/compute costs stay bounded.

**Non-Goals:**
- Attaching videos to sessions, coach/admin access to videos (later changes).
- HLS/adaptive streaming, thumbnails/sprites, multi-rendition ladders.
- Real queue infra; distributed workers.
- In-browser recording.

## Decisions

### 1. S3 Multipart Upload with pre-signed part URLs (client: Uppy)

The browser splits the file into parts (~8 MB), asks the API to sign each part URL, and PUTs parts directly to MinIO/S3 in parallel. On network failure only missing parts are retried; an interrupted upload resumes from the last completed part.

- **Why not single pre-signed PUT (avatar pattern):** no resume, no parallelism, one 2 GB request over mobile Wi-Fi fails and starts over.
- **Why not tus:** protocol is nice but needs a tus server component; S3 multipart gives resume/parallelism natively with infrastructure we already run.
- **Why not proxy through NestJS:** doubles bandwidth, ties up the API, adds nothing.
- **Client:** `@uppy/core` + `@uppy/aws-s3` (multipart mode) + `@uppy/react`. Uppy handles part slicing, parallel PUTs, retries, resume, and progress events; we supply four small endpoint callbacks (create/sign-part/complete/abort). Writing this by hand is error-prone for zero benefit.

New `StorageService` methods: `createMultipartUpload`, `presignUploadPart`, `completeMultipartUpload`, `abortMultipartUpload`, `presignGet` (with optional `response-content-disposition` for downloads). All signing against the public endpoint, object ops against the internal one — same split as today.

### 2. Original is sacred: no client-side re-encode, no lossy touch server-side

The file uploads byte-identical to `videos/{userId}/{videoId}/original.{ext}`. Compression artifacts destroy exactly what a coach needs (racket/wrist detail in fast phases), so cost is bounded by limits instead: `VIDEO_MAX_SIZE_MB` (default 2048) and `VIDEO_MAX_DURATION_MIN` (default 30), both env-configurable. Size is pre-checked at initiation (client-reported) and re-checked after upload (S3 HEAD); duration is enforced at the ffprobe stage. The upload UI shows a recording hint: "1080p at 60 fps if your phone supports it" — fps matters more than resolution for fast strokes, but we only advise, never reject on quality.

### 3. Validation + conditional transcode, in-process for MVP

After `complete`, the API runs a processing pipeline (status `processing`):

1. **ffprobe** the object (S3 pre-signed URL as input — no full download needed for probing): must contain a video stream; extract codec, container, duration, width/height, fps. Over-duration or not-a-video → status `rejected` + reason, object deleted.
2. **Playback decision:** if the source is already browser-safe (H.264 in MP4), the original doubles as the playback file — no transcode, no extra storage. Otherwise (HEVC/.mov, VP9 in weird containers, etc.) **ffmpeg** transcodes an H.264/AAC MP4 capped at 1080p, preserving source fps, `-movflags +faststart`, to `videos/{userId}/{videoId}/playback.mp4`. Then status `ready`.

Execution model: fire-and-forget async task inside the API process with a small concurrency limit (p-limit, 1–2 jobs), statuses persisted in DB. **Why not BullMQ/Redis:** one more piece of infra for a single job type at MVP scale; the DB status machine means a future extraction to a real queue is a refactor, not a redesign. Recovery: on module init, videos stuck in `processing` are re-queued. ffmpeg/ffprobe binaries are added to the API image.

### 4. Data model and API surface

Prisma model `Video`: `id`, `ownerId → User`, `title`, `status` (`uploading | processing | ready | rejected`), `originalKey`, `playbackKey?`, `s3UploadId?`, `sizeBytes?`, `durationSeconds?`, `width?`, `height?`, `fps?`, `codec?`, `container?`, `rejectionReason?`, timestamps. `playbackKey` may equal `originalKey` (browser-safe source).

REST (all owner-scoped, amateur role):
- `POST /videos` — validate limits, create row (`uploading`), initiate multipart → `{videoId, uploadId, key}`
- `POST /videos/:id/parts` — batch pre-sign part URLs `{partNumbers[]} → {urls[]}`
- `POST /videos/:id/complete` — finalize multipart (`parts[{partNumber, etag}]`), size re-check, enqueue processing
- `DELETE /videos/:id` — abort multipart if in-flight; delete S3 objects; delete row
- `GET /videos` / `GET /videos/:id` — library list / detail incl. status + metadata
- `PATCH /videos/:id` — rename
- `GET /videos/:id/playback-url` / `download-url` — short-lived pre-signed GET (download forces `attachment` with the original filename)

Playback is a plain `<video>` tag over the pre-signed URL — S3 serves Range requests, so seeking works without HLS.

### 5. Hygiene: stale uploads

Uploads abandoned mid-flight leave S3 multipart garbage and `uploading` rows. A daily in-process sweep (`@nestjs/schedule`, already a dependency of the scheduling module) aborts multipart uploads and deletes rows older than 24 h in `uploading` status.

## Risks / Trade-offs

- [ffmpeg CPU load in the API container] → concurrency limit of 1–2, transcode only when codec requires it (H.264 sources — the majority of Android — skip it entirely); acceptable at MVP traffic, extraction point to a worker is clean (DB status machine).
- [API restart kills an in-flight transcode] → startup recovery re-queues `processing` rows; pipeline is idempotent (overwrites playback key).
- [Large originals inflate storage cost] → size/duration limits; lifecycle policies later if needed.
- [Pre-signed part URLs expire mid-upload on very slow links] → Uppy re-requests signatures per part via our endpoint; expiry set to 1 h per part URL.
- [ffprobe over pre-signed URL may need many range requests for some containers (moov at end)] → acceptable; fallback is a full download to tmp before probing — decided at implementation if probing proves slow.
- [2 GB browser upload memory] → Uppy slices via Blob.slice; parts stream from disk, memory stays flat.

## Migration Plan

Additive only: new Prisma migration (`Video` table), new S3 prefix, new deps, ffmpeg in the API image. No changes to existing capabilities; rollback = drop the module and table.

## Open Questions

- None blocking. Real S3 lifecycle/retention policy and coach access model deferred to later changes by design.
