## Why

The video-analysis room splits the page 50/50 between the call and the attached clip, so the clip being reviewed gets ~590px of a 1200px page and uses ~420px of a 900px window, while the call frame is a second black rectangle of equal weight. The native `<video>` controls offer no frame step, no loop, no annotated-moment markers, and the playback-speed presets, sync toggle, annotation toolbar and moment chips are scattered in rows under the player. Portrait phone footage (9:16) — most amateur uploads — becomes a thin strip inside half a page. The layout study "Session Review Layouts" compared five arrangements; the owner chose Option A, "Theatre + presence rail".

## What Changes

- **Theatre layout for video-analysis rooms.** Once the call is joined, the clip takes the main column (~924px on the 1200px page) and the call moves into a 260px presence rail on the right, matching the video card's height: counterpart tile on top, own camera tile below, call controls (microphone, camera, screen share, leave) pinned to the bottom of the rail. A 16:9 clip at 924×520 fills the frame without letterbox bars. The pre-join panel and the consultation room keep their current layout.
- **Hide own camera.** A rail control hides the party's own tile, and the counterpart tile then takes the whole rail. The choice is local to the viewer and does not affect publishing. It is remembered per browser.
- **Focus mode.** A control collapses the rail so the video card takes the full column. The call stays connected with audio, and a compact floating bar keeps microphone, leave and exit-focus reachable. Exiting restores the rail.
- **Review player bar** replaces the native controls: play/pause, one-frame step back/forward, current/total time, a scrub timeline with markers at the active clip's annotated moments, a speed menu (existing shared presets), Loop (local whole-clip loop), the sync toggle, and fullscreen of the video card (annotation layer included, call audio continues). Annotated-moment chips stay under the player.
- **Annotation tools move to a vertical rail on the frame's left edge**, the one edge the theatre layout keeps free. The tools and their behavior are unchanged.
- **Portrait footage.** The video card narrows to the clip's aspect ratio at the frame height, but never below 560px (letterboxed sides keep the scrub track usable). The freed width goes to the presence rail, so the tiles get larger.
- **Responsive behavior.** Below 1000px viewport width the rail stacks under the video as a horizontal strip (tiles side by side, controls beside them). On phones (<640px) everything is single-column with 44px touch targets. The fullscreen button in the player bar is the path for detail work, and call audio continues.
- Clip tabs, notes and all shared state from `add-multi-video-attachments` and `add-playback-speed` are kept as they are. Only their placement changes.
- Localized labels for the new controls in all five catalogs.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-rooms`: "Side-by-side attached video for video-analysis sessions" becomes the theatre layout with a presence rail, focus mode and responsive stacking; "Native call UI in the session room" gains the rail presentation and the hide-own-camera control for video-analysis rooms; new requirement "Review player controls".
- `synced-playback`: "Playback speed control" moves from a preset row into the player bar's speed menu (the native player menu no longer exists as a rate source).
- `video-annotations`: "Annotations bound to a moment of the video" also marks the active clip's annotated moments on the player timeline.

## Impact

- **Web:** `components/sessions/session-room.tsx` (layout switch for video-analysis rooms), `livekit-room.tsx` (rail variant of `CallStage`/`CallControls`, hide-own-camera, compact focus bar; the `LiveKitRoom` stays mounted across layout changes), `room-video-panel.tsx` (native controls removed, player bar, left tool rail, aspect-driven card width), new `components/sessions/review-player-bar.tsx`, `annotation-toolbar.tsx` (vertical orientation), possibly a small `lib/use-video-aspect.ts`. Component tests for the bar (frame step, loop, markers, speed menu, fullscreen request) and the layout (rail, hide self, focus, stacking). New `sessions.room.player.*`, `sessions.room.layout.*` keys ×5.
- **Shared / API:** `SessionVideoItem` gains `fps`, `width` and `height` (already probed and stored on `Video`), mapped in the session mapper, so frame step and the card width are known before metadata loads. No database change, no new endpoints.
- **Spec sequencing:** the deltas build on the versions of the requirements in `add-multi-video-attachments` and `add-playback-speed`, which are implemented but not archived. Both must be archived before this change is archived.
- **Related:** `add-annotation-review` (review page) can reuse the player bar; `add-session-recording` phase 2 replay is unaffected.
- **Non-goals:** option B/C/D layouts, draggable/resizable rail, picture-in-picture outside the page, persisting focus mode across reloads, A–B segment loop, per-clip frame-rate metadata.
