## Context

`PlaybackState` is `{ playing, positionSeconds, emittedAtMs }`; followers compute the expected position as `positionSeconds + elapsed` and snap on drift > 2 s. The `<video>` keeps native controls, whose speed menu changes `playbackRate` locally without any sync.

## Goals / Non-Goals

**Goals:** shared rate with the same last-writer semantics; correct compensation at any rate; a visible speed control.
**Non-Goals:** frame stepping, custom player controls, per-user private speed while synced (sync off already allows that).

## Decisions

1. **Rate rides the existing snapshot.** `PlaybackState.rate: number` (required in the shared type; the gateway defaults a missing rate to 1 so an older client during a rolling deploy still relays). Validation: finite, within `PLAYBACK_RATE_RANGE = [0.0625, 4]` (Chromium/WebKit limits); presets are a UI concern, not a wire constraint, so native-menu rates like 1.75 sync too.
2. **Compensation scales by rate.** `target = positionSeconds + elapsedSeconds * rate` while playing; heartbeat unchanged. Applying a remote snapshot sets `video.playbackRate` before play/seek, inside the existing `applyingRef` window so the resulting `ratechange` is not re-published.
3. **`ratechange` is a local gesture.** Same suppression as play/pause/seek; the panel wires `onRateChange` to `sync.onRateChange`. The speed control simply sets `video.playbackRate`; the media event does the publishing, so the native menu and the presets share one path.
4. **Follow-ups.** The review page (change 16) can reuse the presets locally; the recording timeline (change 17, phase 2) must store `rate` per event — noted in that change when implemented.

## Risks / Trade-offs

- [Safari ignores rates outside its supported set] → the element clamps; the published rate is what the element reports after the change, so peers follow the effective value.
- [Old client without `rate` after deploy] → server default 1; harmless for one deploy window.
