## Why

The owner's staging test of the theatre room (2026-09-14, change 21 deployed as `674026f`) with a phone-recorded clip surfaced four things: the whole video card turned solid orange on the first pen stroke (not reproducible on demand), a portrait clip sits small in a letterboxed 16:9 card while the presence rail balloons into two oversized tiles, the card first renders landscape and then jumps because the stored frame size ignores the phone's rotation flag, and there is no way to change camera, microphone or speaker once the call is running.

## What Changes

- **Annotation layer follows the active clip.** The layer measured the `<video>` it saw at mount; after a clip switch that reuses a cached playback URL the element is replaced but the layer keeps observing the detached one, sees 0×0, shrinks its canvas to a single pixel stretched over the card, and the first stroke paints that pixel — the orange screen. The layer now binds to the current element on every clip switch and takes no input while the frame has no measured size.
- **Portrait clips get a taller, narrower card.** For clips narrower than tall, the theatre frame grows to ~80 % of the viewport height, the card narrows to the clip's aspect (floor ~400 px so the player bar stays usable, timeline wrapping onto its own row in narrow cards), the presence rail is capped at 420 px, and the card + rail group is centred instead of stretching the rail into giant tiles. Landscape clips are unchanged.
- **Theatre columns actually applied.** Found during verification: the class change 21 used for the theatre grid produced no CSS under Tailwind 4, so the card and rail were content-sized all along (the oversized tiles on staging). The grid now uses a supported class; landscape clips get the intended 860 px card + 260 px rail.
- **Rotation-aware frame size.** ffprobe reports a phone clip's coded size (1920×1080) plus a display-matrix rotation of ±90°; the probe now swaps width and height when the rotation is a quarter turn, so the stored size matches what the browser renders and the card has the right aspect before metadata loads. Existing rows keep self-correcting from the media's metadata; no backfill.
- **Device switching during the call.** A devices control beside the microphone/camera buttons (rail, stage and focus bar) opens a menu with camera, microphone and — where the browser can route output — speaker pickers; choosing a device switches the published track in place, without reconnecting or re-recording attendance.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `video-annotations`: "Drawing tools over the attached video" — the layer is bound to the active clip's element and never accepts input without a measured frame.
- `session-rooms`: "Side-by-side attached video for video-analysis sessions" — portrait card geometry; "Native call UI in the session room" — in-call device switching.
- `video-library`: "Upload completion and validation" — probed resolution honours the rotation metadata.

## Impact

- **API:** `videos/video-processing.service.ts` probe parsing (`side_data_list[].rotation`, legacy `tags.rotate`) + unit spec. No migration, no env.
- **Web:** `annotation-layer.tsx`, `room-video-panel.tsx`, `session-room.tsx` (portrait geometry), `review-player-bar.tsx` (container-narrow wrapping), `livekit-room.tsx` + new `call-device-menu.tsx`, `sessions.room.call.devices.*` in five catalogs; tests for the layer rebinding, portrait grid, device menu.
- **Ops:** web + API images; deploy together is not required (independent fixes).
