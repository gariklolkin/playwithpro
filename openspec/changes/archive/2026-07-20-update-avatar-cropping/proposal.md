# Proposal: update-avatar-cropping

## Why

Today the avatar uploader rejects anything that is not JPEG/PNG/WebP under 5 MB, pushing the problem onto the user — a large photo from a desktop camera roll or a screenshot simply fails. Modern apps (Telegram, Slack, GitHub) let the user pick any image and crop it in place; the app normalizes the result. The owner confirmed this is the expected behavior for both amateurs and pros.

## What Changes

- Picking an avatar opens a **crop dialog** (square frame, zoom, pan) instead of uploading the file as-is. Works identically for desktop and mobile files of any size, in any format the browser can decode (JPEG, PNG, WebP, GIF, BMP, AVIF).
- The cropped area is exported via canvas to a **fixed 512×512 WebP** (JPEG fallback where WebP encoding is unavailable), so the uploaded object is always small (~100–200 KB) and square; EXIF orientation is baked in and metadata (incl. GPS) is stripped by re-encoding.
- The client-side "type/size" pre-check moves from the *picked file* to the *exported result*; the 5 MB / JPEG-PNG-WebP server validation stays untouched as defense in depth.
- Upload flow, API endpoints, and storage layout are **unchanged** — the dialog feeds the existing pre-signed PUT → confirm sequence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `user-accounts`: the "Account avatar" requirement changes — the UI SHALL accept any browser-decodable image of any size and SHALL upload a normalized square crop produced in a crop dialog; the pre-signed upload restrictions now describe the server contract, not the user-facing limit.

## Impact

- **Web** (`apps/web`): new crop dialog component (`react-easy-crop` + canvas export helper) wired into `AvatarUploader`; message catalog additions for all 5 locales; unit test for the uploader flow.
- **API / DB / infra**: no changes.
- **Out of scope**: HEIC decoding (browser-dependent; revisit with mobile apps), server-side image processing (sharp), multiple stored sizes/thumbnails.
