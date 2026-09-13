## 1. Data model, config and shared contract

- [x] 1.1 Prisma: `SessionVideo` model (id, sessionId, videoId, position, note?, addedAt; `@@unique([sessionId, videoId])`, `@@unique([sessionId, position])`, `@@index([videoId])`, cascade on session and video), `Video.unattachedSince DateTime?`, `Session.videos` / `Video.attachments` relations; migration `add_session_videos` that creates the table, backfills one row at position 0 per `Session.videoId`, drops `Session.videoId`, and sets `unattachedSince = now()` on `READY` videos without a live attachment
- [x] 1.2 Env: `SESSION_VIDEO_MAX_COUNT` (5), `SESSION_VIDEO_MAX_TOTAL_MIN` (60), `LIBRARY_MAX_TOTAL_GB` (10), `LIBRARY_MAX_VIDEOS` (20), `VIDEO_UNATTACHED_RETENTION_DAYS` (90) in `env.validation.ts` + `.env.example` / `infra/k8s/env.example`
- [x] 1.3 Shared: `SessionVideoInput { videoId, note? }`, `SessionVideoItem { videoId, title, note, durationSeconds, position }`, `SESSION_VIDEO_NOTE_MAX_LENGTH` (80); `CreateBookingRequest.videos` replaces `videoId`; `UpdateSessionVideosRequest`; `SessionResponse.videos` and `SessionRoomResponse.videos` replace `videoId`/`videoTitle`; `VideoLimits { file, session, library }` on `VideoListResponse.limits`; `VideoResponse.expiresAt`; `VideoRejectionReason` / upload-initiation reasons `library_full_bytes`, `library_full_count`; `PlaybackState.videoId`, `Stroke.videoId`, `videoId` on undo/clear payloads and `AnnotationState` keyed by clip; `ANNOTATION_LIMITS.momentsPerSession` → `momentsPerClip`

## 2. API — attachments and booking

- [x] 2.1 `bookings/session-videos.validator.ts`: validate a `SessionVideoInput[]` for a player (non-empty, distinct, owned, `READY`, count ≤ cap, Σ duration ≤ cap) returning the videos in order; errors carry `{ reason, max | maxSeconds, totalSeconds }`
- [x] 2.2 `CreateBookingDto.videos` (nested DTO, `ArrayMinSize(1)`, note length) replacing `videoId`; `bookings.service.create` writes `SessionVideo` rows in the booking transaction; `SESSION_INCLUDE` loads `videos` ordered by position; `session.mapper.ts` emits `videos: SessionVideoItem[]`
- [x] 2.3 `PUT /sessions/:id/videos` (player only via `assertParty` + role; `PENDING_PAYMENT`/`PAID_ESCROW`; `now < startsAt`): atomic replace preserving `addedAt` for kept ids, then `recomputeUnattachedSince` for removed and added ids
- [x] 2.4 `videos/unattached.service.ts`: `recomputeUnattachedSince(videoIds)` (null when a live session attaches the clip, else `now` if null); called from booking create, `PUT`, `booking-expiry.service.ts` and pre-start cancellation
- [x] 2.5 Unit specs: validator cases (each rejection with its payload), create with three clips, `PUT` success / after start / coach denied / over cap, `recomputeUnattachedSince` transitions
- [x] 2.6 `test/booking.e2e-spec.ts`: booking with two clips and notes, duplicate rejected, over-cap rejected, `PUT` replace visible to the coach, old `videoId` field rejected

## 3. API — library quota, limits, retention, coach access

- [x] 3.1 `videos.service.initiateUpload`: store declared `sizeBytes` on create; quota check (count and bytes over non-rejected videos) → `409` with reason; `list` returns `limits` (file, session, library with usage) and `expiresAt` per video via `video.mapper.ts`
- [x] 3.2 `requireViewable`: coach access via `videos: { some: { videoId } }` on qualifying sessions; `delete` response/confirmation data: `GET /videos/:id` includes `upcomingSessions` count for the owner
- [x] 3.3 `video-processing.service.ts`: set `unattachedSince` when marking `READY`; daily `sweepExpiredVideos` (`EVERY_DAY_AT_4AM`, guarded like the stale-upload sweep) deleting `READY` videos with `unattachedSince < now − retention` through the shared object-and-row deletion path, logged per video
- [x] 3.4 Unit specs: quota by count / by bytes / rejected videos excluded / in-flight counted; coach access through the join table and after removal; sweep selects only expired unattached `READY` videos; `expiresAt` computation
- [x] 3.5 `test/videos` coverage (extend the existing video e2e or `session-rooms.e2e-spec.ts` coach-access cases): quota refusal at initiation, coach playback of every clip of a paid session, not-found after removal

## 4. API — sync channel per clip

- [x] 4.1 `playback-sync.gateway.ts`: load the session's attached ids when the sync room is created (refresh on an in-process `session.videos.changed` event emitted by `PUT`); drop `playback:publish` and annotation events whose `videoId` is not in the set; `PlaybackState.videoId` relayed as part of the snapshot
- [x] 4.2 Annotation store keyed `sessionId → videoId → momentKey`; caps per clip; add/undo/clear/catch-up carry `videoId`; `sendAnnotationState` sends the per-clip map
- [x] 4.3 `playback-sync.gateway.spec.ts` + `test/playback-sync.e2e-spec.ts`: clip switch relays paused-at-0 state, foreign clip ignored, late joiner receives the active clip, strokes on two clips stay separate, moment cap per clip, attachment refresh after `PUT`

## 5. Web — booking, session editor, list

- [x] 5.1 `booking-panel.tsx` step 3: checkbox list of ready clips, per-clip note input, move up/down, meter (`n of max clips · mm:ss of HH:MM`) from `limits`, submit disabled over cap with the cap message, order summary lists clips; sends `videos`
- [x] 5.2 `components/sessions/session-videos-editor.tsx` (dialog reusing the list) opened from the session card while editable; `PUT` with localized error mapping for `{ reason, max, maxSeconds, totalSeconds }`
- [x] 5.3 `sessions-list.tsx`: render `videos` (title, note, duration) for both parties; coach links per clip on paid sessions; "clips removed" notice when empty; `session-review.tsx` unaffected
- [x] 5.4 Web tests: booking step selection/order/meter/over-cap, editor error mapping, list rendering with notes and empty set

## 6. Web — room, library, upload

- [x] 6.1 `room-video-panel.tsx`: clip tabs (order, note as label), playback URL cache per clip, active clip driven by the shared state; local switch when detached; "clips removed" notice for an empty set; `session-room.tsx` passes `videos`
- [x] 6.2 `use-synced-playback.ts`: `videoId` in published/applied state, source swap before position/rate apply, re-attach snaps to the shared clip; `use-annotations.ts`: per-clip map, active clip selector, `videoId` on emitted events; `annotation-toolbar` moment chips for the active clip
- [x] 6.3 `videos-library.tsx`: quota bar (used/max bytes and count) from `limits`, expiry line per video, delete confirmation naming the number of upcoming sessions; `video-uploader.tsx`: limits and remaining quota above the drop zone, Uppy `maxFileSize` from limits, localized quota refusal
- [x] 6.4 Web tests: `room-video-panel.test.tsx` clip switch + per-clip strokes, library quota bar/expiry, uploader restriction message

## 7. i18n and verification

- [x] 7.1 Catalog keys in en/fr/de/ru/zh: `booking.videos.*` (select, note placeholder, meter, cap messages, move up/down), `sessions.videos.*` (editor, removed notice, edit action), `sessions.room.clips.*` (tabs, removed notice), `videos.quota.*` and `videos.limits.*` (bar, expiry, refusal reasons, delete warning); `messages.test.ts` green
- [x] 7.2 Tilt/dev: verify defaults; document the five env vars in `README`/deploy runbook; note the coordination rule for `add-annotation-review` / `add-session-recording` in their design.md (add `videoId`)
- [x] 7.3 Two-browser check in dev: book with three clips and notes; edit clips after paying; room tab switch syncs and annotations stay per clip; detached browsing and re-attach; delete an attached clip → notice; quota bar and refusal at a lowered `LIBRARY_MAX_*`; retention sweep with `VIDEO_UNATTACHED_RETENTION_DAYS=0` in dev
- [x] 7.4 lint/tsc/unit/e2e green; update `openspec/project.md` roadmap (change 18 → in progress/done) + memory
