## Context

A video-analysis session references one clip through `Session.videoId` (nullable FK, `SetNull` on video delete). That single id flows through the booking DTO and validation (`bookings.service.ts`), the session and room responses (`session.mapper.ts`, `session-rooms.service.ts`), the coach's per-session playback access (`videos.service.ts#requireViewable`), the room UI (`room-video-panel.tsx` fetches one playback URL), and the sync channel (`playback-sync.gateway.ts` keeps `PlaybackState` and the annotation store per session; strokes are bound to a moment key only). Limits exist per file only (`VIDEO_MAX_SIZE_MB` 2048, `VIDEO_MAX_DURATION_MIN` 30), enforced at initiation and at the ffprobe stage; nothing bounds an account's total storage or a session's material, and the UI surfaces limits only as rejection reasons after the fact. Sweeps run as `@Cron` jobs in the owning services (daily stale-upload sweep in `video-processing.service.ts`).

Constraints: single API instance; five locales; no new backing services; no external API clients, so the internal contract can change in one deploy. Two proposed changes (`add-annotation-review`, `add-session-recording`) persist per-session data that will need a clip dimension.

## Goals / Non-Goals

**Goals:**
- A session carries an ordered, annotated (note) set of the player's clips; everything that consumed the single id consumes the set.
- Explicit technical limits at three levels (file, session, account), configured centrally, shown before the player hits them, never tied to session duration or price.
- Clip switching inside the room stays in sync between the parties; annotations stay attached to the right clip.
- Storage stays bounded over time: unattached clips expire, visibly.

**Non-Goals:**
- Paid add-ons for extra clips; coach-configurable caps; trimming, merging, or re-encoding; drag-and-drop ordering; persisting annotations or recordings (other changes).

## Decisions

1. **`SessionVideo` join table replaces `Session.videoId`; the column is dropped in the same migration after backfill.** `SessionVideo { id uuid pk, sessionId, videoId, position Int, note String?, addedAt }`, `@@unique([sessionId, videoId])`, `@@unique([sessionId, position])`, `@@index([videoId])`, cascade on session delete and on video delete. Backfill inserts one row at position 0 per existing `videoId`. *Alternative rejected:* keeping `videoId` as "primary clip" next to the table — two sources of truth for the same fact, and every reader would need a merge rule.

2. **Limits live in env config and travel to the client in the library list response.** New validated env vars with defaults: `SESSION_VIDEO_MAX_COUNT` 5, `SESSION_VIDEO_MAX_TOTAL_MIN` 60, `LIBRARY_MAX_TOTAL_GB` 10, `LIBRARY_MAX_VIDEOS` 20, `VIDEO_UNATTACHED_RETENTION_DAYS` 90. `GET /videos` returns `{ videos, limits: { file: { maxSizeBytes, maxDurationSeconds }, session: { maxClips, maxTotalSeconds }, library: { maxBytes, maxVideos, usedBytes, count } }` so the booking step, the session editor, the library page and the upload page all read one shape from the call they already make (the upload page adds the call). Numbers are formatted client-side per locale. *Alternative rejected:* a separate `/videos/limits` endpoint — one more round trip on pages that already list the library.

3. **Account quota is enforced at upload initiation over declared sizes.** `initiateUpload` stores the declared `sizeBytes` on the `Video` row (today it is set on completion) and rejects with a `409` and a machine-readable reason (`library_full_bytes` / `library_full_count`) when `count(non-rejected videos) ≥ maxVideos` or `sum(sizeBytes of non-rejected videos) + declared > maxBytes`. Completion re-checks the actual object size against the file cap as today; a small overshoot from two concurrent initiations is accepted (the sum is recomputed on the next initiation). Rejected videos hold no object and do not count.

4. **Session caps are validated on the list, at booking and at every edit.** `CreateBookingDto.videos: { videoId, note? }[]` (1..maxClips, distinct ids, note ≤ 80 chars). Validation: every clip owned by the player and `READY`; `Σ durationSeconds ≤ maxTotalSeconds`. The same validator backs `PUT /sessions/:id/videos` (player only; status `PENDING_PAYMENT` or `PAID_ESCROW`; `now < startsAt`), which replaces the set atomically in one transaction (delete rows, insert rows with positions 0..n-1, preserving `addedAt` for ids already present). Errors carry the remaining allowance (`{ reason: 'too_many_clips', max }` / `{ reason: 'too_long', maxSeconds, totalSeconds }`) so the UI can localize with numbers. *Alternative rejected:* per-service caps set by the coach — the limits are about platform resources, not the coach's offer.

5. **The active clip is part of the shared playback state.** `PlaybackState.videoId` is added; a clip switch is a `playback:publish` with the new `videoId`, `positionSeconds: 0`, `playing: false`. The gateway loads the session's attached ids when a party is authorized into the sync room and drops publishes whose `videoId` is not in the set; a miss re-reads the set from the database (rate-limited to one re-read per 2 s per session), so a clip attached through `PUT` after the room opened is accepted without an in-process event bus. *(Implementation note: refresh-on-miss replaced the event originally planned here — same behavior, one fewer moving part.)* Late joiners and reconnects receive the state as today and therefore land on the shared clip. A detached (sync-off) party may switch clips locally; re-attaching snaps back to the shared clip and position. `use-synced-playback.ts` applies a `videoId` change by swapping the source (playback URL cached per clip in the panel) before applying position/rate. *Alternative rejected:* a separate `clip:switch` event — it would need its own catch-up and ordering rules against playback state; one snapshot already models "where we are".

6. **Annotations are scoped per clip.** `Stroke.videoId` is added and validated against the attachment set. The gateway store becomes `Map<sessionId, Map<videoId, AnnotationStore>>`; `ANNOTATION_LIMITS.momentsPerSession` is renamed `momentsPerClip` and all caps apply per clip (worst case 5× today's memory per room, still bounded). Catch-up sends the full per-clip map; `use-annotations.ts` keeps it and `room-video-panel.tsx` renders the active clip's strokes and moment chips. Undo and clear carry `videoId`.

7. **Coach access is defined over the join table.** `requireViewable` replaces `where: { videoId }` with `where: { videos: { some: { videoId } }, ... }` and keeps the status rule (paid, not cancelled). The session list and room responses expose `videos: SessionVideoItem[]` (`videoId, title, note, durationSeconds, position`) for both parties; the coach's list card links each clip to `/dashboard/videos/:id` as it does for one today.

8. **Retention is driven by a maintained `Video.unattachedSince` timestamp.** Set when processing marks a video `READY`; a helper `recomputeUnattachedSince(videoIds)` runs after any attachment change (booking create, `PUT`, booking expiry, cancellation): null when a live session (not cancelled/expired) attaches the clip, otherwise `now` if it was null. A daily sweep (`EVERY_DAY_AT_4AM`, in its own `VideoRetentionService` beside the stale-upload sweep, because it needs `VideosService.purge` and the processing service is a dependency of `VideosService`) deletes `READY` videos with `unattachedSince < now − retention` through the same object-and-row deletion path as the owner's delete. `VideoResponse.expiresAt` = `unattachedSince + retention` (null when attached) so the library shows it. *Alternative rejected:* computing "unattached since" from session timestamps at sweep time — needs the history of removed attachments, which is not stored.

9. **Library deletion cascades into the attachment set.** Deleting a clip removes its `SessionVideo` rows; positions are compacted lazily on the next read (order by `position`, gaps tolerated). A session may end up with zero clips: the room and the list show a localized "clips removed" notice instead of the panel (the `videoId === null` branch generalizes to an empty array), and the player can re-attach from the editor until start. The library shows "attached to N upcoming sessions" before delete so this is a warned choice, not a block. *Alternative rejected:* refusing deletion while attached — the player owns the file; the coach still gets paid and the annotation-review change already tolerates a missing video.

10. **Web components.** `booking-panel.tsx` step 3 becomes a checkbox list of ready clips with per-clip note input, move up/down buttons, and a meter (`n of maxClips clips · mm:ss of HH:MM`); the submit button is disabled while over the cap with the same message. New `components/sessions/session-videos-editor.tsx` reuses that list as a dialog opened from the session card ("Edit clips") while editable. `room-video-panel.tsx` renders clip tabs above the player (note as tooltip/label); `videos-library.tsx` gets a quota bar and per-video expiry line; `video-uploader.tsx` sets Uppy `restrictions.maxFileSize` from the limits and prints file limits and remaining quota above the drop zone.

11. **Coordination with the other proposed changes.** `add-annotation-review` stores strokes per session; after this change its `SessionAnnotation` needs `videoId` (`@@index([sessionId, videoId, momentKey])`) and its review page a clip switcher. `add-session-recording`'s `SessionPlaybackEvent` likewise stores `videoId`. Whichever change lands second adds the column in its own migration; this design does not create their tables.

## Risks / Trade-offs

- [Contract change breaks a stale web build talking to a new API] → API and web deploy together (same release); the DTO rejects the old `videoId` field with a clear validation error rather than silently ignoring it.
- [Backfill drops the column in one migration; rollback is not a plain revert] → the migration is additive-then-drop in one file; the rollback path is documented as re-adding `videoId` from position-0 rows. Acceptable for a staging-only deployment.
- [Sync state grows: per-clip annotation maps] → caps per clip × 5 clips; still kilobytes. The catch-up payload is sent once per connection.
- [Quota race on concurrent initiations] → accepted overshoot bounded by one file; recomputed on the next initiation.
- [Retention deletes user data] → expiry is visible in the library from the moment it starts counting; the default 90 days is generous; deletion goes through the same path as a manual delete and is logged. No email in this change (open question).
- [Limits shown in the UI go stale after an env change] → they are fetched on every page load of the pages that need them; no client caching.
- [Clip switch mid-play is jarring for the follower] → the switch publishes a paused state at 0, so the follower lands on a paused frame, consistent with the "tool activation pauses playback" behavior of annotations.

## Migration Plan

1. Prisma migration `add_session_videos`: create `SessionVideo`, backfill from `Session.videoId`, drop `Session.videoId`; add `Video.unattachedSince` (backfilled: `READY` videos with no live attachment get `now`, so the 90-day clock starts at deploy, not retroactively).
2. Deploy API and web in the same release (env defaults suffice; override on staging only if needed).
3. Verify: existing sessions show their one clip; a new booking with three clips; room tab switch in two browsers; quota bar and upload refusal at the cap; retention sweep dry-run in dev with a short `VIDEO_UNATTACHED_RETENTION_DAYS`.
4. Rollback: revert the release and apply a manual down migration (re-add `videoId` from position-0 rows).

## Open Questions

- Should the retention sweep email the owner a week before expiry? Deferred; the library notice is the MVP signal.
- Should a player be able to attach the same clip to two overlapping upcoming sessions? Allowed (nothing breaks); revisit if coaches complain about reuse.
