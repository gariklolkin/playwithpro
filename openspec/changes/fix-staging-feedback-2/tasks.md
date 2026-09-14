## 1. Annotation layer glitch

- [x] 1.1 `annotation-layer.tsx`: canvas sized to the measured element without the 1 px floor; pointer down/move ignored while the content box has no area
- [x] 1.2 `room-video-panel.tsx`: render `AnnotationLayer` with `key={activeId}` so it rebinds to the replaced `<video>`
- [x] 1.3 Tests: layer accepts no stroke without a measured frame; panel test proves the layer remounts on a cached clip switch (canvas identity changes)

## 2. Portrait geometry

- [x] 2.1 `session-room.tsx`: `portrait = aspect < 1` → frame height `min(880px, 80vh)`, card floor 400 px, rail `minmax(260px, 420px)`, grid `justify-content: center`; landscape values unchanged
- [x] 2.2 `review-player-bar.tsx` + card: `@container` on the video card, timeline takes its own row under `@max-[520px]` as well as under 640 px viewports
- [x] 2.3 Layout test: a 9:16 clip yields the portrait `--frame-h`, `--card-cols` with the 420 px rail cap and centred grid; a 16:9 clip keeps `minmax(260px, 1fr)`

## 3. Rotation-aware probe

- [x] 3.1 `video-processing.service.ts`: parse `side_data_list[].rotation` / `tags.rotate`; swap width/height for quarter-turn rotations
- [x] 3.2 Unit spec: rotated 1920×1080 persists as 1080×1920; unrotated unchanged; `tags.rotate: "90"` handled

## 4. In-call device switching

- [x] 4.1 `call-device-menu.tsx`: devices button + popover with camera/microphone selects over `useMediaDeviceSelect({ kind, room })`; speaker select only when output devices exist and `setSinkId` is supported; closes on outside pointer/Escape/pick
- [x] 4.2 Wire into `CallControls` (stage + rail) and `FocusBar`
- [x] 4.3 i18n `sessions.room.call.devices.*` in en/fr/de/ru/zh
- [x] 4.4 Layout test: the menu lists devices and a pick calls the switch without remounting `LiveKitRoom` or re-joining

## 5. Verification

- [x] 5.1 `pnpm lint`, typecheck, web + api unit tests green
- [x] 2.4 `session-room.tsx`: theatre columns via `grid-cols-(--card-cols)` — Tailwind 4 emitted no CSS for the square-bracket arbitrary-property spelling used by change 21, so the grid had been running on content-sized auto tracks (found during 5.2); layout test asserts the class
- [x] 5.2 Local browser check with the owner's IMG_9738 (dev fixture: Video `5a1d0000-0000-4000-8000-000000009738`, clip 4 of smoke session 739905fa): probe stored 1080×1920 → portrait card from first paint, card 405×716 at 1440×900 with no side bars, rail 420 px and pair centred, timeline on its own row; landscape clip back to 860/260; pen stroke after 1→4→1 switch paints a thin line (0.2 % of the canvas), not the card; devices menu lists camera/microphone/speaker, Escape closes (camera blocked in the test pane, so no live switch)
- [x] 5.3 Deployed to staging 2026-09-14 (`048b428`, api + web, pre-deploy dump `backups/playwithpro-2026-09-14.pgdump`, no migration); owner re-test pending: portrait clip from a phone, device switch mid-call, pen after clip switch
