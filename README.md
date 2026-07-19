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

## Verification call scheduling (Google Meet)

Coaches book their identity video call from published slots; each booking gets a
Google Calendar event with a Meet link on a platform-owned calendar. The
marketplace database is the source of truth — calendar sync is asynchronous,
retried by a cron, and never blocks booking. Locally the API runs with a fake
meeting provider (no Google setup needed).

Production deploy checklist:

1. Google Cloud: create a service account, enable the **Google Calendar API**,
   download its JSON key.
2. Workspace Admin console: grant the service account **domain-wide
   delegation** with scope `https://www.googleapis.com/auth/calendar`.
3. Pick (or create) the Workspace user owning the verification calendar, e.g.
   `verify@yourdomain.com`, and **share that calendar with every admin**
   ("See all event details") — verification calls then show up in each
   admin's own Google Calendar.
4. Set the env vars `GOOGLE_SA_KEY`, `GOOGLE_IMPERSONATE_SUBJECT`,
   `GOOGLE_CALENDAR_ID` (see `.env.example`).
5. Workspace Admin > Apps > **Google Meet**: allow external / anonymous
   participants to knock and be admitted — coaches without Google accounts
   join from the browser and the admin lets them in.
6. Smoke-test with a non-Google mailbox: book a slot, receive the confirmation
   with the `.ics` attachment, join the Meet as an anonymous guest, approve.

## Commit convention

Commit messages are written in English, imperative mood, scoped when helpful (e.g. `api: add health endpoint`).
