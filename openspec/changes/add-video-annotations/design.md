## Context

Video-analysis rooms show the attached video beside the LiveKit call (`components/sessions/room-video-panel.tsx`, native `<video controls>`), with playback state shared over the socket.io namespace `/playback-sync` (`PlaybackSyncGateway`): namespace-middleware auth, party-only, join-window-scoped, in-memory last-state per session dropped when the room empties, single API instance. The coach pauses on frames to explain body positions; there is no way to point at anything.

Constraints: no new backing services; single API instance (in-memory state is acceptable, mirrors playback state); five locales; native video controls stay (no custom player in scope); mobile viewports stack the layout and use touch.

## Goals / Non-Goals

**Goals:**
- Draw on a paused frame and have the other party see it live, on the same spot of the frame.
- Tools that matter for technique: pen, straight line, angle measurement.
- Annotations stay attached to the moment they were drawn at, so a coach can build several annotated moments during one session and jump between them.
- Late joiner / reconnect sees the current annotations.

**Non-Goals:**
- Persisting annotations, post-session review, PNG export, dispute evidence (follow-up `add-annotation-review`).
- Drawing on the call video, text tool, shapes (circle/arrow), laser pointer.
- Replacing the native player controls.

## Decisions

1. **Ride the existing `/playback-sync` channel; no new namespace.** Same auth, same scoping, same room membership. Annotation events are separate message names (`annotation:add|undo|clear|request-state`, server → `annotation:state|added|removed|cleared`). *Alternative rejected:* LiveKit data channel — the tokens deliberately deny `canPublishData`, and annotations must work while a party is not in the call (e.g. before joining).

2. **Data model (shared types).** A `Stroke` = `{ id, momentKey, authorId, tool: 'pen'|'line'|'angle', color, points: [{x,y}], createdAtMs }`, coordinates normalized to the video content box (0..1, origin top-left, letterbox-corrected client-side). `momentKey` = video position rounded to 0.1 s as a string (e.g. `"134.2"`). Angle tool stores exactly three points `[a, vertex, b]`; the degree label is computed on render, never transmitted. Limits enforced server-side: ≤ 200 points per stroke, ≤ 100 strokes per moment, ≤ 50 annotated moments per session; oversize messages are dropped silently.

3. **Server holds the truth, last-writer order.** Gateway keeps `Map<sessionId, Map<momentKey, Stroke[]>>` beside `lastStates`; `add` appends (ids minted client-side as UUIDs, duplicates ignored), `undo` removes the author's most recent stroke on a moment, `clear` empties a moment (either party). State is dropped when the room empties, exactly like playback state. On connect and on `request-state` the full map is sent. Pen strokes are sent once, complete, on pointer-up (no per-point streaming) — simpler, and a 1:1 room does not need live ink.

4. **Moment binding and visibility.** The layer renders strokes for the moment whose key matches the current position within ±0.15 s while paused; while playing it renders nothing. Entering a drawing tool pauses the video (and, through the existing sync, pauses the peer) so both are on the same frame. Moment chips (`0:34`, `2:14`, …) under the player seek the video and, via existing sync, the peer.

5. **Canvas overlay on top of the native player.** A `<canvas>` absolutely positioned over the `<video>`, sized to the video's content box (computed from `videoWidth/videoHeight` vs element rect, redone on resize). `pointer-events` is `none` unless a tool is active, so native controls and the sync overlay keep working; the toolbar's "select" tool returns control. Pointer Events (mouse, touch, pen), `touch-action: none` while drawing. Rendering: 2D context, devicePixelRatio-aware; angle label drawn at the vertex with a contrasting halo.

6. **Web structure.** `lib/use-annotations.ts` (socket events, local state map, optimistic add, undo/clear), `components/sessions/annotation-layer.tsx` (canvas, pointer handling, rendering, letterbox math), `annotation-toolbar.tsx` (tool, color, undo, clear; role color defaults: coach blue, player orange), moment chips in `room-video-panel.tsx`. `use-synced-playback.ts` exposes its socket instance so one connection serves both features. *Alternative rejected:* a drawing library (fabric/konva) — heavier than the three tools need.

7. **Both parties can draw.** Symmetric rights keep the API simple and let the player ask "you mean here?". Undo is per author; clear affects the moment for both (last-writer semantics consistent with playback).

## Risks / Trade-offs

- [Native controls under the overlay] → pointer-events none outside drawing mode; drawing mode is explicit and visible (toolbar state), and Escape/"select" leaves it.
- [Letterbox math wrong → strokes misaligned across window sizes] → normalize against the content box, not the element; unit-test the mapping; verify on a stacked mobile layout.
- [Memory growth on a long-lived API] → hard caps per stroke/moment/session; state dropped when the room empties (same lifecycle as playback state).
- [Seek precision: moment key rounding vs `currentTime`] → 0.1 s keys with ±0.15 s display tolerance; chips seek to the key's exact time.
- [Peer draws while the other is playing] → drawing pauses the drawer's video and the sync pauses the peer; if the peer has sync off they see strokes only when they stop on that moment.

## Migration Plan

No data migration. Ship as one PR; feature is additive to video-analysis rooms. Rollback = revert.

## Open Questions

- Should the player be able to clear the coach's strokes? (MVP: yes, symmetric; revisit with persistence.)
- Angle tool interaction on touch: three taps vs drag; MVP uses three taps with a live preview after the second.
