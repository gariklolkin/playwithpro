## 1. Contract and API

- [x] 1.1 Shared: `PlaybackState.rate`, `PLAYBACK_RATE_PRESETS`, `PLAYBACK_RATE_RANGE`
- [x] 1.2 Gateway `parseState`: default 1, reject non-finite/out-of-range; unit spec + e2e relay of the rate

## 2. Web

- [x] 2.1 `use-synced-playback.ts`: publish rate, rate-aware compensation, apply rate inside the suppression window, `onRateChange` gesture
- [x] 2.2 `room-video-panel.tsx`: speed presets under the player (active highlight, non-preset value shown), `onRateChange` wired; `sessions.room.speed.*` ×5
- [x] 2.3 Panel tests: preset sets `playbackRate` and publishes the rate; remote rate applied; slow playback does not snap

## 3. Verification

- [x] 3.1 lint/tsc/unit/e2e green; dev check with a headless peer (0.25× browser → peer, 0.5× peer → browser, preset highlight follows)
