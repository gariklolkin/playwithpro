## 1. Shared contract

- [ ] 1.1 `packages/shared/src/types/playback-sync.ts`: `AnnotationTool`, `AnnotationPoint`, `Stroke`, `AnnotationState` (moments → strokes), `ANNOTATION_EVENTS` (add/undo/clear/request-state, state/added/removed/cleared), `ANNOTATION_LIMITS` (points per stroke, strokes per moment, moments per session), `momentKeyOf(positionSeconds)` helper
- [ ] 1.2 Role color defaults + moment tolerance constants

## 2. API — gateway

- [ ] 2.1 `PlaybackSyncGateway`: per-session annotation map beside `lastStates`, dropped when the room empties; send full annotation state on connect and on `annotation:request-state`
- [ ] 2.2 Handlers `annotation:add` (validate shape/limits, author = socket user, ignore duplicate ids, relay `annotation:added`), `annotation:undo` (author's latest stroke on the moment → `annotation:removed`), `annotation:clear` (moment → `annotation:cleared`)
- [ ] 2.3 Unit spec: validation and limits, undo is per author, clear empties a moment, state dropped on empty room
- [ ] 2.4 `test/playback-sync.e2e-spec.ts`: add/undo/clear relayed between two party sockets, late joiner receives state, third party still rejected

## 3. Web — annotation layer

- [ ] 3.1 `lib/use-synced-playback.ts`: expose the socket for reuse; `lib/use-annotations.ts` (state map, optimistic add with UUID, undo/clear, catch-up on state event)
- [ ] 3.2 `components/sessions/annotation-layer.tsx`: canvas overlay sized to the video content box (letterbox math, resize observer, DPR), Pointer Events with `touch-action: none` while a tool is active, `pointer-events: none` otherwise; render pen/line/angle (degree label at the vertex with halo)
- [ ] 3.3 Tools: pen (points on move, send on pointer-up), line (drag), angle (three taps with live preview); Escape / select tool exits drawing mode
- [ ] 3.4 `components/sessions/annotation-toolbar.tsx`: tool buttons, color (role default + small palette), undo, clear; activating a tool pauses the video
- [ ] 3.5 Moment binding: show strokes only while paused within tolerance of a moment; moment chips under the player seek to the moment
- [ ] 3.6 `room-video-panel.tsx`: host layer + toolbar + chips for video-analysis rooms only
- [ ] 3.7 Unit test for the normalized ↔ pixel mapping (letterboxed and pillarboxed cases)
- [ ] 3.8 i18n: `sessions.room.annotations.*` in all five catalogs

## 4. Verification

- [ ] 4.1 Two-browser check in dev: pen/line/angle visible on both sides, undo per author, clear, moments list, late joiner catch-up, mobile stacked layout alignment, touch drawing
- [ ] 4.2 lint/tsc/unit/e2e green; update `openspec/project.md` roadmap (change 15) + memory
