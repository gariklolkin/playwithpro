# Design: add-project-foundation

## Decisions

### Monorepo: pnpm workspaces + Turborepo
Single TypeScript toolchain across web and api; shared DTO/types package prevents drift between frontend and backend contracts. Turborepo caches lint/build/test per package.

```
/
├── apps/
│   ├── web/           # Next.js 15 (App Router), Tailwind, shadcn/ui, next-intl
│   └── api/           # NestJS 11, Prisma, class-validator, @nestjs/swagger
├── packages/
│   ├── shared/        # shared types, enums (SessionStatus, ServiceType), zod schemas
│   └── config/        # eslint-config, tsconfig bases
├── infra/
│   ├── docker-compose.yml
│   └── Tiltfile
└── .github/workflows/ci.yml
```

### Local environment: Tilt over docker-compose services
Tilt watches source and rebuilds/restarts `api` and `web` containers with live-update; infrastructure services are plain compose resources.

| Service | Image | Port | Purpose |
|---|---|---|---|
| postgres | postgres:17-alpine | 5432 | primary DB |
| minio | minio/minio | 9000/9001 | S3-compatible storage for videos |
| mailpit | axllent/mailpit | 8025/1025 | catches outgoing email (.ics invites) locally |
| api | local Dockerfile | 4000 | NestJS |
| web | local Dockerfile | 3000 | Next.js |

`tilt up` = full stack. `.env.example` documents every variable; secrets never committed.

### Database access: Prisma
Schema-first with checked-in migrations (`prisma migrate dev`). Initial schema contains only a `HealthCheck` placeholder model to validate the migration pipeline end-to-end.

### CI: GitHub Actions
Single workflow, pnpm cache, Turborepo remote-cache-ready: `lint → typecheck → test → build`. Runs on PRs and main.

## Alternatives considered

- **Nx** instead of Turborepo — heavier, more opinionated; Turborepo is sufficient for 2 apps + 2 packages.
- **docker-compose only** (no Tilt) — owner explicitly requested Tilt; Tilt's live-update UX is better for the two hot-reloading apps.
- **Single Next.js full-stack app** — rejected earlier: payment webhooks, escrow timers, and video processing need long-lived workers that fit NestJS better.

## Risks

- Tilt requires a Docker API. Owner's machine runs **Rancher Desktop** — it must be set to the `dockerd (moby)` container engine (not containerd) so Tilt/compose work against the standard Docker socket. Document this in README.
- Node/pnpm versions pinned via `packageManager` field and `.nvmrc` to avoid drift.
