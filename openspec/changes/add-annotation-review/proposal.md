## Why

Change 15 made annotations ephemeral: everything the coach draws during a video-analysis session disappears the moment the room empties, so the player leaves with nothing to look at afterwards and a dropped socket mid-session can wipe the work. The annotated moments are the concrete output the player paid for, and they are also the cheapest evidence that a session actually took place. Persisting them now is a prerequisite for session recording (planned next): the event-based recording variant replays exactly this data.

## What Changes

- **Annotations are persisted per session.** Every stroke, undo, and clear relayed by the sync channel is written through to the database, so the annotation set survives disconnects, API restarts, and the end of the session. When a room is (re)created the API loads the stored set into memory before serving the first catch-up.
- **Post-session review for both parties.** A session review page shows the attached video with the stored annotations in read-only mode and the moment chips for navigation. It is reachable from the session list once the session has annotated moments and from the room's closed state. Available from the first stroke onward, for the life of the session; no editing after the join window closes.
- **Export a moment as an image.** From the review page, either party can download the current annotated frame (video frame plus strokes) as a PNG.
- **Annotation activity as dispute evidence.** The admin dispute view lists, per session, the number of annotated moments and strokes per author with first and last timestamps, next to the attendance evidence. Admins do not get access to the video or the drawings themselves.
- **Video removal is tolerated.** If the player deletes the attached video later, the annotations remain attached to the session and the review page explains that the video is gone.
- Localized review page, chips, export, and evidence strings in all five catalogs.

## Capabilities

### New Capabilities

- `annotation-review`: post-session read-only review of a session's annotations, moment navigation, PNG export of an annotated frame, and the annotation activity summary shown as dispute evidence.

### Modified Capabilities

- `video-annotations`: "Ephemeral annotation state with limits" becomes durable server-side state — the in-memory room state is a cache over persisted rows, loaded when a room is created and written through on every change; limits unchanged.
- `disputes`: "Dispute visibility for the parties" is unchanged; "Admin dispute queue" gains the annotation activity summary as evidence beside attendance.

## Impact

- **Database:** new `SessionAnnotation` table (session, stroke id, moment key, author, tool, color, points, created at); Prisma migration. Rows cascade with the session.
- **API:** `apps/api/src/session-rooms/playback-sync.gateway.ts` gains a persistence path (load on room creation, serialized write-through on add/undo/clear); new `annotations.service.ts` + `GET /sessions/:id/annotations` (parties only); `disputes.service.ts` adds the activity summary to admin dispute items. Unit specs and `test/playback-sync.e2e-spec.ts` extended; new e2e coverage for the read endpoint.
- **Shared:** `SessionResponse.annotatedMoments` (count), `AdminDisputeItem.annotations` summary type, `SessionAnnotationsResponse`.
- **Web:** new route `app/[locale]/sessions/[id]/review/page.tsx` and `components/sessions/annotation-review.tsx` (read-only `AnnotationLayer`, chips, export button); `sessions-list.tsx` and `session-room.tsx` link to it; `admin-disputes.tsx` shows the evidence block. New `sessions.review.*` and `adminDisputes.annotations.*` keys in five catalogs.
- **Infra:** PNG export draws the video frame onto a canvas, which requires the video to be served with CORS headers that allow the web origin (`crossOrigin="anonymous"`); the MinIO/object-storage CORS rule must allow `GET` from the web origin in addition to the upload methods.
- **Non-goals (explicit):** editing annotations outside the join window, comments or text on moments, sharing a review link with third parties, video/audio recording of the session (next change `add-session-recording`), annotation history/versions.
