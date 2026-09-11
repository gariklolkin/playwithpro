## Context

Annotations (change 15) live only in `PlaybackSyncGateway`'s in-memory `Map<sessionId, Map<momentKey, Stroke[]>>`, dropped when the sync room empties; the socket namespace itself is party-only and join-window-scoped, so nothing is reachable after the session. The room UI (`room-video-panel.tsx`, `annotation-layer.tsx`, `use-annotations.ts`) already renders moment-bound strokes from an `AnnotationState`. Attendance evidence for disputes is a per-session table (`SessionAttendance`) surfaced in the admin dispute queue. Videos are private S3 objects played through short-lived pre-signed GET URLs; the storage CORS rule allows browser PUT/GET for uploads. There is no session detail page: sessions are cards in `/dashboard/sessions`, and `/sessions/[id]/room` is the only session-scoped page.

Constraints: single API instance; five locales; no new backing services; the next change (`add-session-recording`) wants a durable, ordered annotation timeline it can replay.

## Goals / Non-Goals

**Goals:**
- Durable annotations with the same realtime behavior as today; a reconnect or API restart never loses strokes.
- A read-only review of the annotated video for both parties, for the life of the session.
- PNG export of an annotated frame.
- Coarse annotation activity as dispute evidence without exposing content.

**Non-Goals:**
- Editing after the join window; history/versions; comments; sharing outside the two parties; any audio/video recording.

## Decisions

1. **Storage model: one row per stroke, session-scoped, client id kept as a unique key.** `SessionAnnotation { id uuid pk, sessionId, strokeId, momentKey, authorId, tool, color, points Json, createdAt }`, `@@unique([sessionId, strokeId])`, `@@index([sessionId, momentKey])`, cascade on session delete, `authorId` references `User` (no cascade needed beyond the session). Points stay a JSON array of normalized `{x,y}` — they are opaque to SQL, bounded by `ANNOTATION_LIMITS`, and the shape is owned by the shared type. *Alternative rejected:* one JSON blob per session — simpler writes but undo/clear become read-modify-write races and the dispute summary needs per-author aggregation anyway.

2. **Gateway stays the single writer; write-through with a per-session promise chain.** `addAnnotation`/`undoAnnotation`/`clearAnnotation` keep their current shape: validate, mutate memory, relay immediately. Persistence is appended to a per-session serialized queue (`Map<sessionId, Promise<void>>`, each op chained onto the previous) so add → undo → add for the same moment lands in the database in the applied order without awaiting the DB on the hot path. Failures are logged and the chain continues; the in-memory copy remains authoritative for the live room. Undo deletes by `(sessionId, strokeId)`; clear deletes by `(sessionId, momentKey)`. A duplicate add (same `strokeId`) is already rejected in memory; the unique constraint backs that up after a restart.

3. **Load on room creation, not on every connect.** In `handleConnection`, when the session has no in-memory store, the gateway awaits `AnnotationsService.load(sessionId)` before emitting the catch-up (`annotation:state`) and before joining the socket to the room, so the first party sees the persisted set and no relayed event can race the load. Subsequent connections use memory as today. The emptying rule is unchanged: memory is dropped when the room empties; the database keeps the truth.

4. **Read path via REST, not the socket.** `GET /sessions/:id/annotations` (`AnnotationsController` in `session-rooms`) returns `AnnotationState` for a session party (reusing `assertParty` from `session-access.ts`) and 404 for anyone else, regardless of status or window. The review page reads it once; no socket connection outside the window. `SessionResponse.annotatedMoments` is computed in the session query via a grouped count (distinct `momentKey`) so the list can show the link without a second call.

5. **Review page reuses the room's rendering path in read-only mode.** New `components/sessions/annotation-review.tsx` composes the existing `<video>` + `AnnotationLayer` with `tool="select"` (the layer already renders without intercepting events in that mode), the moment chips, and the export button; no toolbar, no `useAnnotations` socket hook — state comes from the REST response. Route `app/[locale]/sessions/[id]/review/page.tsx` server-fetches the session and annotations and redirects non-parties like the room page does. Entry points: the session card (when `annotatedMoments > 0`) and the room's closed state.

6. **Export composes on the client.** A hidden canvas at `videoWidth × videoHeight`: `drawImage(video)` then the layer's existing stroke renderer at full resolution, `toBlob('image/png')`, download via an object URL named `<session>-<m:ss>.png`. This requires the `<video>` to be loaded with `crossOrigin="anonymous"`, which in turn requires the object storage to answer pre-signed GETs with `Access-Control-Allow-Origin` for the web origin. Dev MinIO gets a bucket CORS rule in the Tilt setup; production is a documented Hetzner bucket rule (the existing upload rule already lists GET, so this is a verification step, not a new rule). If the frame is tainted the export button shows a localized "export unavailable" hint instead of failing silently. *Alternative rejected:* server-side rendering with ffmpeg — adds an API workload and a code path for a feature that works fine in the browser.

7. **Dispute evidence is an aggregate, computed on read.** `DisputesService.listForAdmin` groups `SessionAnnotation` by `authorId` for the disputed sessions (`count`, `min(createdAt)`, `max(createdAt)`) plus a distinct-moment count, mapped into `AdminDisputeItem.annotations: { moments, byAuthor: [{ userId, role, strokes, firstAt, lastAt }] } | null` (null for non-video-analysis sessions). No strokes or video leave the API for admins.

8. **Video deletion.** `Session.videoId` already goes null on delete. The review page renders the moments list with a notice and disables export; annotation rows are untouched. Nothing to reconcile.

## Risks / Trade-offs

- [Write-through lag: a party reconnects to an empty room before the last write landed] → the chain is awaited in `load` (the gateway awaits the session's pending chain before reading), so load never observes a stale set.
- [Loading on first connect adds latency to the connect ack] → one indexed query per room creation; bounded by the session caps (≤ 50 moments × 100 strokes).
- [Tainted canvas breaks export] → CORS rule in dev and prod verified by a Tilt smoke step; graceful localized fallback in the UI.
- [Storing normalized coordinates as JSON makes them unqueryable] → nothing needs to query inside a stroke; the evidence summary uses row-level columns only.
- [Table growth] → bounded per session by the existing caps; rows cascade with the session. No retention job in this change.

## Migration Plan

One Prisma migration adding `SessionAnnotation`; additive, no backfill (ephemeral history is gone by definition). Deploy API before web (the web only adds a read call). Rollback = revert the deploy; the table can stay.

## Open Questions

- Should the review link also appear on the video library page (all sessions that annotated this video)? Deferred; the session list is enough for MVP.
- Retention beyond the session's life (e.g. purge with the video after N months) — decide together with recording retention in `add-session-recording`.
