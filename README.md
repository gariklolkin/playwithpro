# PlayWithPro

Two-sided marketplace connecting amateur table tennis players with verified professional players and coaches for paid one-on-one video consultations.

## Stack

- **apps/web** — Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **apps/api** — NestJS, Prisma, PostgreSQL
- **packages/shared** — shared types and enums
- **packages/config** — shared tsconfig / eslint / prettier presets
- Monorepo managed with pnpm workspaces + Turborepo
- Local dev environment: Tilt + Docker Compose (PostgreSQL, MinIO, Mailpit)

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- [pnpm](https://pnpm.io/) 9.x
- Docker Desktop or Rancher Desktop, set to the **`dockerd (moby)`** container engine (not containerd) — required for Tilt/Compose to reach the standard Docker socket
- [Tilt](https://tilt.dev/)

## Getting started

```bash
pnpm install
cp .env.example .env
tilt up
```

- Web app: http://localhost:3000
- API health check: http://localhost:4000/health
- MinIO console: http://localhost:9001
- Mailpit UI: http://localhost:8025

Tilt watches `apps/web` and `apps/api` and live-reloads on source changes; infrastructure services (postgres, minio, mailpit) run as plain Compose resources.

Press `Ctrl+C` and run `tilt down` to stop and tear down the environment.

## Common commands

```bash
pnpm lint        # lint all workspaces
pnpm typecheck   # typecheck all workspaces
pnpm test        # unit tests for all workspaces
pnpm build       # build all workspaces
```

## Commit convention

Commit messages are written in English, imperative mood, scoped when helpful (e.g. `api: add health endpoint`).
