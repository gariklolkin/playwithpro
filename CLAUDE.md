# PlayWithPro — Table Tennis Coaching Marketplace

Two-sided marketplace: amateur players book paid sessions with verified table tennis professionals. Exactly three services: video analysis, consultation (both via video call), and an in-person game at a venue. Escrow payments, video upload to S3, online sessions via Google Meet/Jitsi, 5 UI languages (en/fr/de/ru/zh).

## Spec-driven workflow (OpenSpec) — MANDATORY

- Read `openspec/AGENTS.md` (workflow rules) and `openspec/project.md` (stack, conventions, roadmap) before any work.
- Work strictly by change packages in `openspec/changes/<change-id>/`: follow `proposal.md` + `design.md`, implement per `tasks.md`, check off tasks as you go (`- [x]`).
- Do not invent features outside the active change. Changes 1–4 of the roadmap (through pro profiles/verification, incl. verification scheduling and email codes) are archived; next planned change: `add-availability-scheduling`.
- After a change is done and verified, archive it per `openspec/AGENTS.md`.

## Key references

- `design/DESIGN.md` — design system (Notion-style tokens, session state machine, UX flows)
- `design/design-proposal.html` — interactive mockup of all key screens

## Hard conventions

- All code, comments, docs, commit messages — English. (Owner communicates in Russian in chat.)
- Stack: pnpm + Turborepo monorepo; `apps/web` Next.js (App Router, Tailwind, shadcn/ui, next-intl); `apps/api` NestJS + Prisma + PostgreSQL; Tilt for local dev; MinIO as local S3.
- Money: integer minor units + currency code. Time: UTC in DB, viewer timezone in UI.
- No hard-coded UI strings — next-intl catalogs only.
- Provider abstractions (do not bind business logic to vendors): `PaymentProvider` (mock in MVP), `VideoProvider` (Meet | Jitsi), `CalendarProvider` (Google | .ics email).
- Session lifecycle: `draft → pending_payment → paid_escrow → in_progress → awaiting_confirmation → completed_paid | disputed → resolved`.
