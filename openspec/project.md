# Project Context

## Purpose

**PlayWithPro** — a two-sided marketplace connecting amateur table tennis players with verified professional players and coaches for paid one-on-one sessions.

Exactly three service types (keep it simple — anything further the parties arrange themselves):

1. **Video analysis** (`video_analysis`) — amateur uploads footage, pro reviews it live on a video call
2. **Consultation** (`consultation`) — a plain video call
3. **Game** (`game`) — an **in-person** practice game at a physical venue (pro specifies city/club); no video room — the calendar invite carries the venue address, and session completion relies on mutual confirmation + the dispute window

Core value loop: an amateur uploads game footage → picks a verified pro by language/service/price → books an available time slot → pays (funds held in escrow) → both parties meet on a video call → after the session is confirmed, funds are released to the pro minus a platform fee.

## Roles

- **Amateur (player)** — browses catalog, uploads videos, books and pays for sessions, confirms session completion, leaves reviews.
- **Professional (coach)** — creates a profile (bio, achievements, languages, services with per-service hourly prices), submits credentials for verification, publishes availability slots, conducts sessions, receives payouts.
- **Admin** — validates professional profiles, resolves disputes, oversees users and transactions.

## Tech Stack

- **Frontend:** Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui, next-intl (locales: en, fr, de, ru, zh; `en` is default)
- **Backend:** NestJS + TypeScript, Prisma ORM, PostgreSQL
- **Monorepo:** pnpm workspaces + Turborepo (`apps/web`, `apps/api`, `packages/*`)
- **Video storage:** S3-compatible (AWS S3 in prod, MinIO locally), pre-signed upload URLs
- **Video calls:** `VideoProvider` abstraction — Google Meet when the coach has Google connected, embedded Jitsi room as the default fallback (no Google account required for any user). Join always goes through a platform session-room page so attendance is logged.
- **Calendar:** `CalendarProvider` abstraction — Google Calendar API for users who connected Google, universal `.ics` email invites otherwise
- **Payments:** `PaymentProvider` abstraction with escrow semantics (`hold` / `release` / `refund`); mock provider in MVP, real provider (candidate: Stripe Connect) to be decided later
- **Local dev:** Tilt + Docker Compose (postgres, minio, mailpit, api, web)
- **CI:** GitHub Actions (lint, typecheck, test, build)

## Project Conventions

- All project documents, code, comments, commit messages — **English**. Conversation with the project owner is in Russian.
- UI copy externalized in next-intl message catalogs; no hard-coded strings.
- Design language: Notion-inspired (see `design/DESIGN.md`) — ink `#37352F` on white, pastel status tags, emoji icons, 8/12px radii.
- API: REST, OpenAPI-documented via NestJS decorators; DTO validation with class-validator.
- Database: Prisma schema is the source of truth; migrations checked in.
- Money: integer minor units (cents) + ISO 4217 currency code; never floats.
- Time: store UTC, render in viewer's timezone.
- Testing: unit tests colocated; e2e for booking/payment flows are mandatory before a change is archived.
- Session lifecycle (canonical state machine):
  `draft → pending_payment → paid_escrow → in_progress → awaiting_confirmation → completed_paid | disputed → resolved`

## Tech debt / known issues

- In-container `tsc --watch` cold compile takes ~5 min on the owner's machine (Rancher Desktop VM file I/O). Consider: running dev servers as Tilt `local_resource` on the host instead of containers, or SWC builder for NestJS. Revisit when it becomes painful.

## Roadmap (planned changes)

1. `add-project-foundation` ✅ — monorepo scaffold, Tilt dev env, CI, empty web/api apps
2. `add-auth-and-accounts` ✅ — email+password & Google OAuth, roles, sessions (JWT), account settings
3. `add-i18n` ✅ — locale routing, message catalogs for 5 languages, language switcher
4. `add-pro-profiles-verification` ✅ — coach profile CRUD, services & pricing (incl. mapped venue for the in-person game service), admin verification queue; follow-ups also archived: `add-verification-scheduling` ✅ (slot booking, Google Meet, meeting state machine) and `update-email-verification-code` ✅ (6-digit email confirmation codes)
5. `add-availability-scheduling` ✅ — coach weekly availability template, materialized bookable slots, timezone handling, public open-slot listing
5a. `add-player-profiles` ✅ — amateur player profile (level, experience, style, about), account-level avatar via S3 pre-signed uploads (first S3 usage; `StorageModule` reused by video upload), player card for coaches/admins
6. `add-video-upload` — S3 pre-signed uploads, video library for amateurs
7. `add-booking-escrow` — booking flow, PaymentProvider abstraction + mock, escrow hold
8. `add-session-rooms-calendar` — session room page, VideoProvider (Meet/Jitsi), CalendarProvider (Google/.ics), attendance logging; in-person game sessions get a venue-address invite instead of a video room
9. `add-confirmation-payouts-disputes` — mutual confirmation, auto-confirm window, release/refund, dispute flow
10. `add-reviews-ratings` — post-session reviews
11. `add-admin-console` — users, transactions, disputes, analytics
