## Why

Video analysis is the flagship service of the marketplace: an amateur uploads game footage and a pro reviews it live on a call. Today there is no way to get a video into the platform — the booking flow (next change, `add-booking-escrow`) needs an existing video library to attach footage to a `video_analysis` session. Footage must retain enough quality (resolution, frame rate, sharpness) for frame-by-frame technique analysis, which rules out naive "compress on the client and POST to the API" approaches.

## What Changes

- **Video upload direct to S3** via multipart pre-signed URLs: the browser uploads file parts straight to MinIO/S3 (parallel, resumable, with progress), the API only orchestrates. No proxying video bytes through NestJS.
- **No client-side re-encode**: the original file is uploaded as-is to preserve motion sharpness and frame rate; upload cost is bounded by size/duration limits instead of compression.
- **Server-side validation worker**: after upload completes, ffprobe verifies the file is a real video, extracts metadata (codec, container, duration, resolution, fps), and enforces limits; invalid uploads are rejected and cleaned up.
- **Playback rendition**: when the source codec is not browser-playable (e.g. iPhone HEVC/.mov), a background job transcodes an H.264 MP4 rendition for in-browser playback. The original is always preserved and downloadable for frame-by-frame analysis.
- **Video library for amateurs**: list, watch, rename, and delete own videos; upload page with drag-and-drop, progress, and recording-quality guidance (1080p/60fps hint). Localized in all 5 languages.
- **Processing status lifecycle** per video: `uploading → processing → ready | rejected`, surfaced in the UI.

## Capabilities

### New Capabilities

- `video-library`: amateur video upload (multipart pre-signed, resumable), server-side validation and playback-rendition processing, video library management (list/play/download/rename/delete), quality limits and status lifecycle.

### Modified Capabilities

- `player-profiles`: the "My videos" stub on the profile page becomes a live summary (recent uploads + link to the library); the "My sessions" stub is unchanged.

## Impact

- **API (`apps/api`)**: new `videos` module (controller, service, DTOs); `StorageModule` extended with S3 multipart operations (create/sign-part/complete/abort) and pre-signed GET for streaming/download; new Prisma model `Video` + migration; background processing (ffprobe/ffmpeg) in-process for MVP — no new queue infra.
- **Web (`apps/web`)**: new video library and upload pages (Uppy `@uppy/aws-s3` multipart client), video player, message catalog additions for en/fr/de/ru/zh.
- **Infra**: ffmpeg/ffprobe added to the API dev image; new S3 key prefix `videos/`; env limits (max size/duration) in config.
- **Dependencies**: `@uppy/core`, `@uppy/aws-s3`, `@uppy/react` (web); ffprobe/ffmpeg binaries (api container).
- **Out of scope**: attaching videos to sessions (comes with `add-booking-escrow`), coach access to a player's videos (granted per-session later), HLS streaming.
