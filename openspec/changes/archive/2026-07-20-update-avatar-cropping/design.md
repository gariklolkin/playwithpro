# Design: update-avatar-cropping

## Context

`AvatarUploader` (`apps/web/components/settings/avatar-uploader.tsx`) currently pre-checks the picked file (type/size) and pushes it unchanged through pre-signed PUT → confirm. The server (`users` module + `StorageService`) validates content type and a 5 MB cap. Both amateurs and pros use the uploader (player profile page and account settings).

## Goals / Non-Goals

**Goals:**
- Accept any browser-decodable image of any size; the user frames a square crop; output is always a small normalized image.
- Zero API/DB/infra changes — the crop dialog is purely a front-end concern.

**Non-Goals:**
- HEIC support (browser-dependent; needs wasm decoder or server-side conversion — revisit with mobile apps).
- Server-side processing (sharp) and multiple stored sizes.

## Decisions

1. **`react-easy-crop` for the dialog.** Tiny, dependency-free, touch-friendly (pinch zoom), battle-tested; renders the image and reports crop area in pixels. Alternative — hand-rolled canvas drag/zoom — more code for a worse UX; cropper.js — heavier, jQuery lineage.

2. **Canvas export helper** (`lib/crop-image.ts`): draw the selected area onto a 512×512 canvas via `createImageBitmap`/`drawImage`, then `canvas.toBlob("image/webp", ~0.85)` with a JPEG fallback when the WebP blob comes back null (older Safari). Re-encoding strips EXIF/GPS and bakes orientation. 512×512 keeps the object ~100–200 KB — far under the server cap.

3. **Validation moves to decode-time.** The picked file is no longer checked for type/size; instead we try to load it (`URL.createObjectURL` + image load). Load failure → inline "not an image" error. The exported blob always satisfies the server contract, so the old `badType`/`tooLarge` client states collapse into a single decode-error state (server errors still surface via the generic error state).

4. **Dialog UX**: modal with the crop area, a zoom slider, Save/Cancel. Cancel discards everything (object URL revoked). Reuses the existing card/Button idioms; strings via next-intl in all five catalogs.

## Risks / Trade-offs

- [WebP encoding unavailable in some browsers] → `toBlob` fallback to JPEG; server already accepts both.
- [Very large source images can spike memory during decode] → `createImageBitmap` with `resizeWidth` hint downscales early; acceptable for MVP.
- [GIF loses animation] → intended: avatars are static; first frame is used.

## Migration Plan

Pure front-end change; no migration. Rollback = revert the component.

## Open Questions

- None.
