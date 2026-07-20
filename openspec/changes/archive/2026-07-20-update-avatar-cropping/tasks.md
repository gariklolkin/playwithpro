# Tasks: update-avatar-cropping

## 1. Crop dialog

- [x] 1.1 Add `react-easy-crop` to `apps/web`; build `lib/crop-image.ts` (decode file → cropped 512×512 WebP/JPEG blob, EXIF baked, metadata stripped)
- [x] 1.2 `AvatarCropDialog` component: modal with square crop frame, zoom slider, pan, Save/Cancel; object URLs revoked on close

## 2. Uploader integration

- [x] 2.1 Rework `AvatarUploader`: file pick → decode check (inline error if not an image) → crop dialog → normalized blob through the existing upload-url/PUT/confirm flow; drop the picked-file type/size pre-checks
- [x] 2.2 Message catalog entries (en/fr/de/ru/zh) for the dialog and the decode error; remove now-unused `badType`/`tooLarge` strings if nothing else references them

## 3. Verification

- [x] 3.1 Unit test: crop-image helper produces a ≤5 MB square blob of an allowed type from an oversized source (vitest, canvas mocked or jsdom-compatible path)
- [x] 3.2 Browser check via Tilt: pick a large photo on `/dashboard/profile`, crop, save; verify the stored avatar renders and the object in MinIO is ~512×512 WebP/JPEG
- [x] 3.3 Lint, typecheck, web tests green; `openspec validate` passes
