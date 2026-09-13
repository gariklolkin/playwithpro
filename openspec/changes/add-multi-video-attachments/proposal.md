## Why

A video-analysis session carries exactly one video today (`Session.videoId`), but a player's material is rarely one file: a match recording plus separate clips of a serve, a forehand loop, a footwork drill. Forcing them to pick one clip either loses the drills or pushes players to stitch files together before uploading. At the same time the platform cannot accept unbounded material: today there is a per-file cap (2 GB, 30 min) but no cap on how much one account stores or how much one session can carry, and none of the limits is shown to the player before they hit it. This change lets a session carry several clips under explicit, visible technical limits — deliberately not tied to the session's duration, since the parties pause the video to talk and video minutes never equal call minutes.

## What Changes

- **Several clips per video-analysis session.** A booking attaches an ordered list of the player's own ready videos (at least one), each with an optional short note ("serve", "forehand loop") so the coach knows what to look at. The player can add, remove, reorder and re-annotate clips until the session starts; the price does not depend on the clip count.
- **Per-session attachment caps.** Platform configuration caps the number of clips and their total duration per session (defaults: 5 clips, 60 min). Caps are shown as a meter in the booking step and in the post-booking editor; an over-cap attachment is refused with the remaining allowance in the message.
- **Per-account library quota.** Platform configuration caps the total stored size and the number of videos per account (defaults: 10 GB, 20 videos). The upload page shows the per-file limits and the remaining quota before a file is chosen; an upload that would exceed the quota is refused at initiation.
- **Retention for unattached clips.** A ready video that is not attached to any session for a configurable period (default 90 days) is deleted by a sweep; the library shows the expiry date on such videos and clears it once the video is attached.
- **Room with a clip switcher.** The video-analysis room shows the attached clips as tabs above the player; the active clip is part of the shared playback state, so switching clips propagates like play/pause/seek, and annotations, moment chips and catch-up are scoped per clip.
- **Coach access follows the attachments.** The coach's per-session playback access covers every clip attached to a paid session; the session list shows all clips.
- **BREAKING (internal API contract):** `CreateBookingRequest.videoId` becomes `videos: [{ videoId, note? }]`; `SessionResponse` and `SessionRoomResponse` replace `videoId`/`videoTitle` with a `videos` array; `Session.videoId` is dropped in favor of a `SessionVideo` join table (backfilled). `Stroke` and `PlaybackState` gain `videoId`. No external clients exist.
- Localized booking step, editor, room tabs, limit messages and library quota strings in all five catalogs.

## Capabilities

### New Capabilities

- `session-video-attachments`: the ordered set of clips attached to a video-analysis session — notes, per-session caps, post-booking editing until start, behavior when a clip is deleted from the library, and what each party sees of the set.

### Modified Capabilities

- `booking`: "Video attachment for video-analysis bookings" requires at least one clip within the caps instead of exactly one; "Localized booking flow" gains the multi-select step with the caps meter.
- `video-library`: new "Per-account library quota", "Limits visible before upload" and "Unattached video retention" requirements; "Per-session coach access to attached video" is defined over the attachment set.
- `session-rooms`: "Side-by-side attached video for video-analysis sessions" becomes a clip switcher over the attached set.
- `synced-playback`: "Shared playback control between the session parties" and "State catch-up on join and reconnect" include the active clip in the shared state.
- `video-annotations`: "Annotations bound to a moment of the video" binds a stroke to a clip and a moment; "Ephemeral annotation state with limits" applies its caps per clip.

## Impact

- **Database:** new `SessionVideo` table (session, video, position, note, added at; unique per session+video and per session+position; cascade on session and on video delete); `Session.videoId` dropped after backfill. `Video` gains nothing; the library quota is computed from `sizeBytes`.
- **API:** `bookings.service.ts` (validation over a list, `PUT /sessions/:id/videos`), `session.mapper.ts`, `session-rooms.service.ts` (room response), `videos.service.ts` (`requireViewable` over `SessionVideo`, quota check on upload initiation, `GET /videos` carries quota and caps), new retention sweep in `video-processing.service.ts` or a sibling cron, `playback-sync.gateway.ts` (state and annotation stores keyed by clip, caps per clip). New env: `SESSION_VIDEO_MAX_COUNT`, `SESSION_VIDEO_MAX_TOTAL_MIN`, `LIBRARY_MAX_TOTAL_GB`, `LIBRARY_MAX_VIDEOS`, `VIDEO_UNATTACHED_RETENTION_DAYS`. Unit specs and e2e (`bookings`, `videos`, `playback-sync`) extended.
- **Shared:** `SessionVideoItem`, `SessionVideoInput`, `VideoLimits`/`LibraryQuota` types; `videoId` on `PlaybackState` and `Stroke`; `VideoResponse.expiresAt`.
- **Web:** `booking-panel.tsx` (multi-select with order, note, meter), new `components/sessions/session-videos-editor.tsx` on the session card, `room-video-panel.tsx` + `use-synced-playback.ts` + `use-annotations.ts` (active clip, per-clip stores), `sessions-list.tsx`, `videos-library.tsx` (quota bar, expiry), `video-uploader.tsx` (limits shown up-front, Uppy size restriction). New `booking.videos.*`, `sessions.videos.*`, `sessions.room.clips.*`, `videos.quota.*` keys in five catalogs.
- **Related proposed changes:** `add-annotation-review` (`SessionAnnotation`) and `add-session-recording` (`SessionPlaybackEvent`) assume one video per session; whichever of them lands after this change stores `videoId` on its rows and scopes its review/replay per clip. If either lands first, this change's migration adds the column.
- **Non-goals (explicit):** paid add-ons for extra clips (phase 2, only if coaches ask), clip trimming or merging, per-service caps set by the coach, drag-and-drop ordering (buttons suffice), sharing clips across sessions beyond re-attaching from the library.
