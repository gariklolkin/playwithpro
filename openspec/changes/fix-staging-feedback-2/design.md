## Context

Change 21 (`update-video-analysis-room-layout`, deployed to staging, unarchived) introduced the theatre layout, the custom player bar and the left-edge annotation rail. The owner's first staging test with a real phone clip (HEVC .MOV, 1920×1080 coded with `rotation=-90`) exposed the defects listed in the proposal. This change is a fix pack on top of 21; its deltas modify the requirement texts as written in 21 and must be archived after it.

## Goals / Non-Goals

**Goals:** kill the orange-canvas glitch for good; make portrait clips large and the rail sane; store rotation-correct frame size; let a party switch camera/mic/speaker mid-call.

**Non-Goals:** a backfill of already-probed rows (they self-correct from `loadedmetadata`); re-probing on demand; pre-join redesign; user-resizable rail; speaker selection on browsers without `setSinkId` (Firefox, Safari) — the picker is simply absent there.

## Decisions

### D1. Annotation layer keyed by the active clip, with a zero-size guard
Root cause: `AnnotationLayer`'s measuring effect depends on the ref object, not the element, so it runs once per mount. `<video key={activeId}>` is replaced on every clip switch; when the new clip's URL is already cached the surrounding fragment stays mounted, so the layer keeps its `ResizeObserver` on the detached element, receives 0×0, sets its canvas to `Math.max(1, 0)` = 1×1 CSS-stretched over the card, and the first stroke fills that pixel.
Fix: `RoomVideoPanel` renders `<AnnotationLayer key={activeId}>` so the layer remounts with its element (the half-made draft is dropped, which a clip switch should do anyway). Defensively the layer also (a) sizes its canvas to the measured element without a 1 px floor — a 0×0 canvas paints nothing — and (b) ignores pointer input while the content box has no area, so a mis-measured layer can never paint a stroke over the card.
*Alternative:* lift the element into state via a callback ref and pass it down — more plumbing (the sync hook and the bar take the ref) for the same effect.

### D2. Portrait geometry in the theatre grid
`SessionRoom` already knows `aspect`. Define `portrait = aspect < 1`. Theatre variables become:
- frame height: landscape `min(520px, 62vh)` (unchanged); portrait `min(880px, 80vh)`.
- card min width: landscape 560 px (unchanged); portrait 400 px.
- rail column: landscape `minmax(260px, 1fr)` (unchanged); portrait `minmax(260px, 420px)`.
- grid `justify-content: center` in portrait so the card + rail pair sits centred in the 1200 px container instead of the rail absorbing the rest.
The `--card-cols` clamp keeps its shape: `clamp(min(MIN, 100% − rail_reserve), frame_h × aspect, 100% − rail_reserve)`. The card's own `aspectRatio`/`max-h-[var(--frame-h)]` already follow `--frame-h`. Stacked (<1000 px) and phone layouts: the card is full width with height by aspect capped at 60vh — a portrait clip is already tall there; unchanged.
Rail tiles: the own tile stays 16:9 at rail width (≤420 px → ≤236 px tall); the counterpart tile takes the rest of the card height. No new props.

**Found while verifying:** change 21 set the theatre columns with the arbitrary-property class `[grid-template-columns:var(--card-cols)]`, for which Tailwind 4 emits no CSS at all — the grid had implicit content-sized `auto` tracks, which is exactly the "card too wide, rail ballooned" look on staging. The template now uses the variable shorthand `grid-cols-(--card-cols)` (emitted; verified in the browser: 405/420 portrait, 860/260 landscape). Two Tailwind 4 dev gotchas recorded here: it scans comments too (a class-like `var(…)` in a code comment broke the whole stylesheet build), and its candidate set is cumulative until the dev server restarts.

### D3. Player bar wraps by card width, not viewport width
At a 400 px card the bar's controls overflow one row. Tailwind 4 container queries: the video card becomes a `@container` and the timeline's "own row" rule (`order-last basis-full`, today `max-[639px]:`) additionally applies under `@max-[520px]` of the card. Nothing else changes; the 44 px touch targets stay viewport-driven.

### D4. Rotation-aware probe
ffprobe (`-show_streams`) exposes rotation in `side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }]` and, for older muxers, `tags.rotate: "90"`. `probe()` reads `rotation = side_data rotation ?? Number(tags.rotate) ?? 0`; when `Math.abs(rotation) % 180 === 90` it swaps `width`/`height`. ffmpeg autorotates during transcode (its `scale` expression sees the rotated `iw/ih`), and browsers apply the matrix on playback, so the swapped values are what actually renders. `fps`, codec, duration untouched.
Existing rows (staging: the owner's IMG_9738): `RoomVideoPanel` already prefers `videoWidth/videoHeight` from `loadedmetadata`, so the card corrects itself within the first second; the brief jump is accepted rather than adding a re-probe path.

### D5. In-call device menu over LiveKit's device hook
New `call-device-menu.tsx`: a `DevicesButton` (`Settings2` icon, same `ControlButton` look) toggling a popover anchored above the controls with up to three `<select>`s. Each uses `useMediaDeviceSelect({ kind, room })` from `@livekit/components-react`, which enumerates devices, reports `activeDeviceId`, and on change calls `room.switchActiveDevice(kind, id)` — the published track is replaced in place; the `LiveKitRoom` element, its token and the attendance row are untouched. The speaker select renders only when `kind: "audiooutput"` yields devices and `HTMLMediaElement.prototype.setSinkId` exists (Chromium); other browsers show camera and microphone only. Closes on outside pointer, Escape, or a pick. Rendered in `CallControls` (stage + rail) and in `FocusBar`. i18n `sessions.room.call.devices.{open, title, camera, microphone, speaker}` ×5.
*Alternative:* LiveKit's `MediaDeviceMenu` component — depends on the components stylesheet the app deliberately does not load.

## Risks / Trade-offs

- [Keying the layer drops a draft when the *peer* switches clips mid-stroke] → acceptable: the frame under the pen is gone anyway.
- [Switching the camera while the derived device notice is armed could flash "camera unavailable"] → `switchActiveDevice` keeps `isCameraEnabled` true across the swap; verified in the browser smoke.
- [`justify-content: center` shifts the card left-edge relative to the clip tabs/title above it] → tabs and title live inside the card column, so they move with it.
- [80vh portrait frame on short windows (≤700 px tall)] → `min(880px, 80vh)` yields ≥ 560 px of frame; the card floor of 400 px still holds the bar; on very short viewports the rail (≥ own tile 236 px + controls) may exceed the card height and stretch the grid row — tolerated.

## Migration Plan

Web and API are independently deployable; no DB change, no env. Rollback: revert. Archive order: 18, `add-playback-speed`, 21, then this change.

## Open Questions

- Should the pre-join `DevicePicker` and the in-call selects share one component? Deferred; pre-join uses uncontrolled preview tracks, in-call uses the room — the `<select>` markup is small enough to duplicate for now.
