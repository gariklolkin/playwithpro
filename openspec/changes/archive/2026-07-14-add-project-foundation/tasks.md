# Tasks: add-project-foundation

## 1. Monorepo scaffold
- [x] 1.1 Init pnpm workspace + Turborepo (`pnpm-workspace.yaml`, `turbo.json`, root `package.json` with pinned `packageManager`)
- [x] 1.2 Create `packages/config` (shared tsconfig + eslint + prettier presets)
- [x] 1.3 Create `packages/shared` (placeholder enums: `SessionStatus`, `ServiceType`, `Locale`)
- [x] 1.4 Add `.editorconfig`, `.gitignore`, `.nvmrc`, root `README.md`

## 2. Backend app
- [x] 2.1 Scaffold `apps/api` — NestJS + Swagger setup, config module (env validation)
- [x] 2.2 Add Prisma with placeholder model; first migration committed
- [x] 2.3 Implement `GET /health` (reports app + DB status)
- [x] 2.4 Unit test for health controller

## 3. Frontend app
- [x] 3.1 Scaffold `apps/web` — Next.js App Router + Tailwind + shadcn/ui
- [x] 3.2 Encode design tokens from `design/DESIGN.md` as Tailwind theme (colors, radii, shadows)
- [x] 3.3 Placeholder landing page using the tokens (hero from design proposal)
- [x] 3.4 Smoke test (page renders)

## 4. Local environment (Tilt)
- [x] 4.1 Dockerfiles for `api` and `web` (dev targets with live-reload)
- [x] 4.2 `infra/docker-compose.yml`: postgres, minio (+ bucket bootstrap), mailpit
- [x] 4.3 `infra/Tiltfile`: compose resources + live-update for api/web
- [x] 4.4 `.env.example` covering all services
- [x] 4.5 Verify: `tilt up` → web on :3000, api /health green, minio console reachable, mailpit reachable

## 5. CI
- [x] 5.1 GitHub Actions workflow: pnpm cache → lint → typecheck → test → build
- [x] 5.2 Verify workflow passes on the scaffold

## 6. Verification & archive
- [x] 6.1 Fresh-clone test: `pnpm i && tilt up` works following README only
- [x] 6.2 Archive change: apply `dev-environment` delta to `openspec/specs/`, move folder to `changes/archive/`
