# Change: add-project-foundation

## Why

The TopSpin marketplace needs a reproducible development foundation before any feature work: a monorepo hosting the Next.js frontend and NestJS backend, a one-command local environment (Tilt) with all infrastructure dependencies (PostgreSQL, MinIO, mail catcher), and CI that keeps the codebase healthy from day one.

## What Changes

- Scaffold a pnpm + Turborepo monorepo: `apps/web` (Next.js, TypeScript, Tailwind, shadcn/ui), `apps/api` (NestJS, Prisma), `packages/shared` (shared types/constants), `packages/config` (eslint/tsconfig presets).
- Add Prisma with an initial empty schema wired to PostgreSQL; migration workflow established.
- Add Tilt + Docker Compose local environment: `postgres`, `minio` (S3), `mailpit` (SMTP catcher), `api` and `web` with live-reload.
- Add health-check endpoint (`GET /health`) on the API and a placeholder landing page on the web app using the design tokens from `design/DESIGN.md`.
- Add GitHub Actions CI: install, lint, typecheck, unit tests, build for both apps.
- Add repository hygiene: `.editorconfig`, `.gitignore`, `README.md` (English), commit convention note.

**New capability specs:** `dev-environment`

## Impact

- Affected specs: `dev-environment` (new)
- Affected code: entire repository scaffold (new files only, nothing to break)
- Non-goals: no auth, no business features, no real payment/video providers — subsequent changes per roadmap in `project.md`
