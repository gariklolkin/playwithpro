## 1. Clip metadata for the room

- [x] 1.1 Add nullable `fps`, `width`, `height` to `SessionVideoItem` in `packages/shared/src/types/booking.ts`
- [x] 1.2 Map them from the joined `Video` in `apps/api/src/bookings/session.mapper.ts` and `apps/api/src/session-rooms/session-rooms.service.ts`; extend mapper/room unit specs

## 2. Review player bar

- [x] 2.1 Create `components/sessions/review-player-bar.tsx`: play/pause, time/duration, frame back/forward (`fps ?? 30`, centre-biased target, pauses first)
- [x] 2.2 Scrub timeline on `<input type="range">` with drag preview and seek-on-release (keyboard seeks immediately)
- [x] 2.3 Annotated-moment markers on the track that call the panel's `seekToMoment`
- [x] 2.4 Speed menu over `PLAYBACK_RATE_PRESETS` with the current rate on the trigger (non-preset value shown)
- [x] 2.5 Loop toggle (local; on `ended` → seek 0 + play) and sync toggle (moved from the panel header)
- [x] 2.6 Fullscreen of the video card via `requestFullscreen`, `webkitEnterFullscreen` fallback on the video element; reflect state from `fullscreenchange`
- [x] 2.7 Accessible labels, focus styles, 44px targets under 640px with the timeline wrapping onto its own row

## 3. Video panel refactor

- [x] 3.1 In `room-video-panel.tsx` remove native `controls`, the speed preset row and the header sync button; render `ReviewPlayerBar` inside the card; wire `durationchange`/`ended`
- [x] 3.2 Turn `annotation-toolbar.tsx` into a vertical icon rail (palette in a popover) and render it at the card's left edge above the annotation layer
- [x] 3.3 Compute the card aspect from `SessionVideoItem.width/height`, corrected on `loadedmetadata`; expose it to the room layout (callback or context)
- [x] 3.4 Keep clip tabs, note header, moment chips, resume-sync overlay and load/failed states working; update `room-video-panel` tests

## 4. Call presence rail

- [x] 4.1 Add `onPhaseChange` to `LiveKitCall` and a `layout: "stage" | "rail" | "focus"` prop passed to `CallStage`
- [x] 4.2 Rail layout: counterpart tile (screen share handling), own tile below, quality badge, controls pinned at the bottom, hide-self and focus buttons
- [x] 4.3 Hide-own-tile preference in `localStorage` (`pwp.room.hideSelf`, try/catch) without touching publishing
- [x] 4.4 Focus layout: compact floating bar (mic, leave, exit focus) rendered inside `LiveKitRoom`
- [x] 4.5 Stacked strip variant for 640–999px (tiles side by side, controls beside)

## 5. Room layout

- [x] 5.1 In `session-room.tsx` hold `callPhase`/`focus`/`hideSelf`, keep one stable grid for video-analysis rooms; pre-join uses the current split, in-call switches to theatre via classes and `--card-cols`
- [x] 5.2 Card width clamp (560px floor, rail ≥260px, height `min(520px, 62vh)`), portrait footage widens the rail
- [x] 5.3 Breakpoints: theatre ≥1000px, stacked 640–999px, single column <640px; replace the `min-[900px]` split
- [x] 5.4 Consultation room and countdown/closed states unchanged

## 6. Localization

- [x] 6.1 Add `sessions.room.player.*` (play, pause, frameBack, frameForward, loop, fullscreen, exitFullscreen, speed, timeline, markers) and `sessions.room.layout.*` (focus, exitFocus, hideSelf, showSelf, hideSelfHint, onCall) to en/fr/de/ru/zh

## 7. Tests

- [x] 7.1 `review-player-bar` tests: frame step math at 30/60/unknown fps, seek-on-release, markers seek, speed menu sets `playbackRate`, loop restarts on `ended`, fullscreen request
- [x] 7.2 Room layout tests: pre-join split → theatre after join, hide-self persists, focus hides tiles but keeps controls, LiveKit room connects exactly once across focus/hide toggles
- [x] 7.3 Consultation room renders without rail/player (regression)

## 8. Verification

- [x] 8.1 `pnpm lint`, `pnpm typecheck`, `pnpm test` for web, api, shared green
- [x] 8.2 Local two-browser smoke (coach + player) at 1440, 1024, 800 and 390px widths: sync of play/pause/frame step/scrub/speed/loop restart, annotations with the left tool rail, markers, clip switch, portrait clip width, focus mode, hide self, fullscreen; no extra attendance rows after layout toggles
- [ ] 8.3 Deploy to staging and hand the owner the re-test checklist (desktop Chrome/Safari/Firefox, iPhone Safari fullscreen fallback)

## 9. Docs

- [x] 9.1 Update `design/DESIGN.md` session-room section and `openspec/project.md` roadmap entry when done
