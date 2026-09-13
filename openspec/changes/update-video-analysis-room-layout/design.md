## Context

The video-analysis room today (`session-room.tsx`) is a two-column grid (`min-[900px]:grid-cols-2`): `LiveKitCall` on the left, `RoomVideoPanel` on the right. `RoomVideoPanel` renders a native `<video controls>` capped at 520px height, then stacked rows under it: speed presets, `AnnotationToolbar`, moment chips; clip tabs and the sync toggle sit above. `LiveKitCall`'s `CallStage` draws a 16:10 `CallFrame` with the counterpart as the main tile and the own camera as a corner tile, with `CallControls` below the frame.

The owner reviewed the "Session Review Layouts" canvas (baseline, options A–D, portrait footage, phone) and chose Option A with two full tiles in the rail, a hide-own-tile control, and a focus mode. Constraints: the 1200px page container and Notion tokens from `globals.css`; shared playback and annotations (changes 12, 15, 18, playback-speed) must behave identically; the `LiveKitRoom` must never remount because a remount reconnects and records a new attendance entry.

## Goals / Non-Goals

**Goals:**
- Theatre layout: video card with review player bar in the main column, 260px+ presence rail of equal height.
- A player bar that makes frame-accurate review possible (frame step, scrub with moment markers, speed, loop, sync, fullscreen).
- Aspect-driven card width so portrait clips stay usable and give space back to faces.
- Hide-own-tile and focus mode without touching the call connection.
- Stacked (<1000px) and phone (<640px) layouts.

**Non-Goals:**
- Layout options B/C/D, user-resizable rail, browser picture-in-picture.
- Changes to the sync protocol, annotation protocol, or the consultation room.
- A–B segment loop, keyboard shortcuts beyond focusable controls (can follow later).
- Persisting focus mode across reloads.

## Decisions

### D1. One stable tree, layout by classes
`SessionRoom` owns the layout state (`callPhase`, `focus`, `hideSelf`) and renders a single grid whose children — the clip panel and the call — never change element type or position; only class names and CSS variables change between pre-join (current two-column split), theatre, focus and stacked modes. `LiveKitCall` reports its phase through a new `onPhaseChange` callback so the room switches to theatre only once `in-call`. In focus mode the rail is not unmounted: `CallStage` receives `layout="rail" | "focus" | "stage"` and in `focus` renders a compact floating bar (mic, leave, exit focus) instead of tiles, still inside `LiveKitRoom` so `useTrackToggle`/`useRoomContext` keep working and `RoomAudioRenderer` keeps playing.
*Alternative:* render the rail in a portal or conditionally mount a second call component — rejected, both risk a remount/reconnect.
A test asserts the LiveKit room is connected exactly once across focus/hide/stack toggles.

### D2. Card width from the clip's aspect ratio
Card height is fixed per breakpoint (`min(520px, 62vh)` in theatre). Card width = `clamp(560px, height × aspect, column − rail_min − gap)` with `rail_min = 260px`, exposed as a CSS variable on the grid (`grid-template-columns: var(--card-cols)`, i.e. `clamp(…) minmax(260px, 1fr)`); the rail's offset and height come from the card's measured box (`--rail-top`, `--rail-h`). Aspect comes from `SessionVideoItem.width/height` (added in this change from the already-stored `Video` probe) and is corrected from `videoWidth/videoHeight` on `loadedmetadata`; 16:9 until known. Letterboxing of narrower clips is the video element's `object-contain` on a black card.
*Alternative:* pure CSS `aspect-ratio` on the card — rejected: it cannot express the 560px floor plus "rest goes to the rail" without knowing the ratio anyway.

### D3. Own player bar over the existing media events
`controls` is removed from `<video>`; new `ReviewPlayerBar` is a controlled component over `videoRef` fed by the events `RoomVideoPanel` already handles (`play/pause/seeked/ratechange/timeupdate/loadedmetadata`, plus `durationchange`, `ended`). Every action mutates the element (`play()`, `pause()`, `currentTime`, `playbackRate`), so the existing `useSyncedPlayback` media-event path publishes it — no new sync API.
- **Frame step:** `fps = clip.fps ?? 30`; pause, then seek to `(round(t × fps) ± 1) / fps + 0.001` (frame centre-biased target avoids landing on the previous frame's boundary in Chromium/Firefox).
- **Scrub:** an `<input type="range">` for keyboard/a11y, visually styled; while dragging the bar shows the drag position and seeks once on release (keyboard changes seek immediately). This avoids a burst of `seeked` publishes to the peer.
- **Markers:** absolutely positioned buttons over the track at `moment / duration`, sharing `seekToMoment` with the chips.
- **Speed:** a menu with `PLAYBACK_RATE_PRESETS`; the trigger shows the current rate (non-preset shown as value).
- **Loop:** local state; on `ended` with loop on → `currentTime = 0; play()` (the `loop` attribute is avoided because it restarts without `ended`/`play` events and the peer would stall at the end).
- **Fullscreen:** `requestFullscreen()` on the video card (video + annotation layer + bar). Where element fullscreen is unavailable (iOS Safari), fall back to `video.webkitEnterFullscreen()` — native player, no annotations — acceptable for phone detail viewing.

### D4. Annotation toolbar as a left-edge rail
`AnnotationToolbar` becomes a vertical rail (the room panel is its only consumer, so no orientation switch), rendered inside the card at the left edge above the annotation layer (z-order: video < layer < tool rail < bar). Tools, undo and clear are icon buttons; the palette opens in a small popover to keep the rail narrow; the tool hint shows beside the rail. Behavior (pause on tool activation, Escape, undo scope) is unchanged.

### D5. Presence rail and hide-own-tile
`CallStage` with `layout="rail"` renders a flex column: counterpart tile (`flex-1`, `object-cover`, screen share `object-contain`), own tile (fixed 16:9 at rail width) unless hidden, quality badge on the counterpart tile, controls row at the bottom plus a hide/show-self toggle and the focus button. Hiding the own tile only stops rendering `VideoTrack`; publishing is untouched. The preference is stored in `localStorage` (`pwp.room.hideSelf`) with try/catch fallbacks. When the counterpart shares a screen, the rail's top tile shows the screen and the counterpart's camera takes the second slot, the own tile then showing as a small corner overlay (or hidden if the user hid it).
*Alternative:* self as PiP inside the counterpart tile (Option C) — owner preferred two full tiles.

### D6. Breakpoints
- `≥1000px`: theatre (D2).
- `640–999px`: card full width with height by aspect (max 60vh), rail becomes a horizontal strip under it: two tiles side by side (each 16:9), controls to the right; focus hides the strip.
- `<640px`: single column: clip tabs, card with bar, moment chips, tiles side by side, controls with 44px targets. Tool rail stays inside the card; the player bar keeps its buttons at 44px and wraps the timeline onto its own row (no overflow menu — every control stays one tap away).
Replaces the current `min-[900px]` split.

### D7. Fields for fps and dimensions
`SessionVideoItem` gets `fps`, `width`, `height` (nullable), filled from the joined `Video` in `bookings/session.mapper.ts` and `session-rooms/session-rooms.service.ts`. The review page (`session-review.tsx`) receives them too but ignores them for now.

## Risks / Trade-offs

- [A class or wrapper change accidentally remounts `LiveKitRoom` → reconnect + extra attendance row] → D1 single tree; component test counting connects; manual check of attendance rows after toggling focus on staging.
- [Frame step imprecision on VFR phone footage (stored fps is the average)] → accept: a step may skip/duplicate a frame; chips/markers still bind to 0.1 s moments.
- [Scrub commit-on-release feels laggy for the peer] → peer receives one seek on release; local preview is immediate. Revisit with throttled live seeks if coaches ask.
- [Fullscreen on iOS loses annotations and the custom bar] → documented fallback; landscape stacked layout remains usable.
- [Rail at 1000–1100px viewport leaves the card below 924px] → D2 clamp keeps the rail at 260px and shrinks the card; 16:9 then gets thin top/bottom bars only if the height cap bites, which is acceptable.
- [Removing native controls loses PiP/download/captions menus] → none are used by the product; PiP is an explicit non-goal.

## Migration Plan

Frontend plus an additive response field; no database migration. Deploy web and API together (older web ignores the new fields; newer web defaults fps to 30 and aspect to 16:9 if the API is older). Rollback: revert the commit. Spec archive order: `add-multi-video-attachments` and `add-playback-speed` first, then this change.

## Open Questions

- Should the review page from `add-annotation-review` reuse `ReviewPlayerBar`? Likely yes; decided when that change is implemented.
- Keyboard shortcuts (space, ←/→ frame, ,/. ) — deferred until coaches ask; the controls are focusable now.
