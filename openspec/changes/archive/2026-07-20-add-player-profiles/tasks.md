# Tasks: add-player-profiles

## 1. Data model & storage foundation

- [x] 1.1 Prisma migration: `PlayerLevel`/`Handedness`/`Grip` enums, `PlayerProfile` model (1:1 User), `User.avatarKey String?`
- [x] 1.2 Add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` to `apps/api`; new `StorageModule` with `StorageService` (presignPut, headObject, deleteObject, publicUrl) configured from env
- [x] 1.3 Env plumbing: `S3_ENDPOINT`, `S3_PUBLIC_URL`, `S3_REGION`, `S3_BUCKET`, credentials in `.env.example`, Tilt/compose env for the api container; document MinIO CORS default

## 2. API — avatar (users module)

- [x] 2.1 `POST /users/me/avatar/upload-url` — validate content type (jpeg/png/webp) and declared size ≤ 5 MB, return pre-signed PUT + key (`avatars/<userId>/<uuid>.<ext>`)
- [x] 2.2 `PUT /users/me/avatar` — verify object via HEAD (exists, size, content type), attach key, best-effort delete of previous object; `DELETE /users/me/avatar` — detach + delete
- [x] 2.3 Expose `avatarUrl` in the auth `me` payload and everywhere user identity DTOs are returned
- [x] 2.4 Unit tests: upload-url validation, confirm flow (mocked StorageService), remove flow

## 3. API — players module

- [x] 3.1 `players` module: `GET /players/me` (amateur guard, create-on-first-access), `PATCH /players/me` (DTO validation per spec: level enum, yearsOfExperience ≥ 0, handedness, grip, about)
- [x] 3.2 `GET /players/:id` for professional/admin roles; forbidden for amateurs; response includes playing details + identity (displayName, avatarUrl)
- [x] 3.3 Unit tests: role guards, first-access creation, validation errors, coach read

## 4. Web — avatar uploader

- [x] 4.1 `AvatarUploader` component: file pick → request upload-url → PUT to storage → confirm; client-side type/size pre-check; initials fallback rendering
- [x] 4.2 Integrate into `/settings/account` for all roles; show avatar in dashboard shell header
- [x] 4.3 Message catalog entries (en/fr/de/ru/zh) for avatar UI

## 5. Web — player profile page

- [x] 5.1 `/dashboard/profile` for amateurs: profile editor (level select, years, handedness/grip, about) + avatar block, keeping coach rendering intact for professionals
- [x] 5.2 Stub sections "My videos" / "My sessions" as empty states
- [x] 5.3 `PlayerCard` read-only component (identity + playing details) for future booking/session screens
- [x] 5.4 Message catalog entries (en/fr/de/ru/zh) for player profile UI

## 6. Verification

- [x] 6.1 e2e script `scripts/e2e-player-profile.sh`: register amateur → first-access profile → PATCH details → avatar upload-url/PUT/confirm against MinIO → coach reads `/players/:id` → amateur-to-amateur read forbidden
- [x] 6.2 Browser check via Tilt: edit profile + upload avatar on `/dashboard/profile`, verify persistence and initials fallback
- [x] 6.3 Lint, typecheck, unit tests green; update `openspec/project.md` roadmap with the new change entry
