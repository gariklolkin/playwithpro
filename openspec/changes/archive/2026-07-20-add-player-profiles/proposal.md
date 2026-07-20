# Proposal: add-player-profiles

## Why

Amateurs (players) currently have only bare account settings (name, locale, timezone), while every upcoming change — video upload, booking, session rooms, reviews — assumes a coach can see who they are dealing with. A lightweight player profile (avatar, playing level, experience) gives coaches context before and during sessions and gives the platform its first avatar/media foundation, agreed with the owner on 2026-07-20 as the next change outside the original roadmap.

## What Changes

- New **player profile** owned by each `amateur` user: playing level, years of experience, optional playing-style details, and a short "about" text.
- **Avatar at the account level** (not player-specific): any user — amateur or professional — can upload a profile photo; it will later surface in the coach catalog, session rooms, and reviews. This is the platform's first S3 usage (pre-signed uploads to MinIO/S3), front-running the pattern that `add-video-upload` will reuse.
- New **profile page for amateurs** in the dashboard with stubbed sections for "My videos" and "My sessions" that later changes (`add-video-upload`, `add-booking-escrow`) will populate.
- Coaches SHALL be able to read a player's profile (read-only card) — full wiring into booking/session screens lands with those changes, but the read endpoint and card component are created now.
- UI strings for all five locales via next-intl; no hard-coded copy.

## Capabilities

### New Capabilities
- `player-profiles`: amateur-owned profile — playing level, experience, style, about text; owner editing; read access for coaches and admins; profile page with future-content stubs.

### Modified Capabilities
- `user-accounts`: account basics gain an avatar — upload via pre-signed URL (JPEG/PNG/WebP, size-limited), replace, remove; avatar is returned with the user's public identity everywhere it is exposed.

## Impact

- **Database**: new `PlayerProfile` model (1:1 with `User`, amateur role); `User.avatarKey` column; Prisma migration.
- **API** (`apps/api`): new `players` module (profile CRUD, read-by-id for coaches/admins); new `storage`/avatar endpoints issuing pre-signed PUT URLs against MinIO/S3; S3 client dependency added.
- **Web** (`apps/web`): amateur profile page (edit + view), avatar uploader component in account settings, player card component; message catalogs for en/fr/de/ru/zh.
- **Infra**: MinIO already runs in Tilt; a bucket + CORS config for avatars is needed (env-driven, works with AWS S3 in prod).
- **Out of scope**: video uploads (change 6), coach avatar surfacing in a public catalog (comes with catalog/booking changes), any rating systems (see `add-reviews-ratings`).
