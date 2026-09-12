## Why

Technique lives in fractions of a second: a coach analysing a serve or a forehand needs to watch the attached video at quarter or half speed, and the player needs to see the same slow-motion pass. The native player's speed menu is per-browser and invisible to the sync channel, so today one party slowing the video down silently desynchronizes the other.

## What Changes

- **Playback speed is part of the shared playback state.** The sync snapshot carries the rate; a rate change by either party propagates like play, pause, and seek. Elapsed-time compensation and drift correction take the rate into account so a follower at 0.25× lands on the same frame as the commander.
- **Speed control under the attached video** with presets 0.25×, 0.5×, 0.75×, 1×, 1.5×, 2×; the active preset is highlighted and a non-preset rate set through the native menu is shown as its value. Localized labels.
- **Server validation** drops snapshots whose rate is outside the browser-supported range; a snapshot without a rate is treated as 1× for compatibility.
- Annotations are unaffected: strokes bind to a moment, and drawing still pauses the video.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `synced-playback`: "Shared playback control between the session parties" gains the playback rate; "Drift correction during shared playback" compensates elapsed time by the rate; new requirement "Playback speed control".

## Impact

- **Shared:** `PlaybackState.rate`, `PLAYBACK_RATE_PRESETS`, `PLAYBACK_RATE_RANGE`.
- **API:** `playback-sync.gateway.ts` `parseState` validates/defaults the rate; unit + e2e.
- **Web:** `lib/use-synced-playback.ts` publishes and applies the rate (`ratechange` gesture, rate-aware compensation, `setRate`); `room-video-panel.tsx` speed control; `sessions.room.speed.*` keys ×5; panel tests.
- **Follow-ups:** `add-annotation-review` replay/export unaffected; `add-session-recording` phase 2 must persist the rate in the playback timeline (design note added there at implementation time).
