## Why

In video-analysis sessions the coach pauses the attached video to explain technique — the angle of a knee, the height of an elbow, the path of the racket — and today can only describe it in words over the call. Drawing directly on the paused frame, visible to both parties in real time, turns that explanation into something the player can see. The room already has a party-only realtime channel (synced playback) and a shared player, so annotations are an incremental capability on existing infrastructure rather than a new subsystem.

## What Changes

- **Annotation layer over the attached video** in the session room (video-analysis sessions only): a canvas overlay with pen, straight line, and an **angle tool** (three points → the angle at the vertex, in degrees, rendered on the frame), per-role colors, undo of one's own last stroke, and clear-frame.
- **Annotations belong to a moment of the video.** They are drawn on a paused frame and are shown whenever playback sits at that moment (within a small tolerance); while playing, the layer is hidden. A row of moment chips under the player lists annotated moments and seeks to them.
- **Realtime sharing between the two parties** over the existing playback-sync socket channel: new annotation events (add, undo, clear) relayed by the API, with catch-up of the current annotation set on connect and reconnect. Both parties can draw.
- **Ephemeral in MVP:** annotations live in the API's in-memory room state for the duration of the session room (dropped when the room empties, like playback state) and are not persisted. Post-session review, export, and dispute evidence are a follow-up change.
- Resolution-independent coordinates (normalized to the video's content box) so both parties see strokes on the same pixels regardless of window size or letterboxing; touch/pen input works on mobile.
- Localized toolbar and hints in all five catalogs.

## Capabilities

### New Capabilities

- `video-annotations`: drawing tools over the attached video, moment-bound frames, realtime sharing between the parties, catch-up, limits, and localized UI.

### Modified Capabilities

- `synced-playback`: "Party-only, window-scoped sync channel" currently states the channel carries playback state only; it is widened to also carry annotation events under the same authentication and scoping rules (still never playback URLs, room slugs, or other session data).

## Impact

- **Shared:** `packages/shared/src/types/playback-sync.ts` gains annotation types, events, and limits.
- **API:** `apps/api/src/session-rooms/playback-sync.gateway.ts` (annotation events, per-session in-memory annotation state, validation and caps), unit spec and `test/playback-sync.e2e-spec.ts` extended. No database changes.
- **Web:** new `components/sessions/annotation-layer.tsx` (canvas + tools), `annotation-toolbar.tsx`, `lib/use-annotations.ts`; `room-video-panel.tsx` hosts the layer and the moment chips; `lib/use-synced-playback.ts` exposes the socket for reuse. New `sessions.room.annotations.*` keys in five catalogs.
- **Dependencies:** none new (plain Canvas 2D).
- **Non-goals (explicit):** persistence and post-session review, image export, annotations on the live call video, freehand shapes beyond pen/line/angle, text labels.
