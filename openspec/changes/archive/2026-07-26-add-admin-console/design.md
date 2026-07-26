# Design — add-admin-console

## Context

Admins today have two tools, both grafted onto the shared dashboard: the verification queue (`/dashboard/verification`, change 4) and the dispute queue (`/dashboard/disputes`, change 9), served by `apps/api/src/admin` (verification only) and `apps/api/src/disputes` (admin endpoints inside the disputes module). The platform now has users, sessions, an escrow payment ledger (`Payment` rows per attempt), and reviews with a drift-free aggregate (`ProProfile.ratingSum/ratingCount`, change 10) — but no admin surface over any of them.

Constraints that shape this design:

- Roles are already enforced via `JwtAuthGuard` + `RolesGuard` + `@Roles(Role.Admin)`; the console reuses this stack unchanged.
- Money stays in integer minor units; analytics sums must not float.
- Review deletion MUST decrement `ratingSum`/`ratingCount` in the same transaction (roadmap note; the aggregate is intentionally not recomputed from scratch).
- All UI strings via next-intl in 5 locales; times in viewer timezone.

## Goals / Non-Goals

**Goals:**

- One admin console area gathering all admin duties: verification, disputes (existing), users, transactions, analytics, review moderation (new).
- Account suspension that takes effect immediately (no valid refresh path afterwards).
- Read-only oversight of payments — surfacing the audit trail exactly as stored.
- Review deletion that provably cannot drift the coach aggregate.

**Non-Goals:**

- No money movement from the console (release/refund happen only via the existing dispute-resolution and settlement flows).
- No user editing (email, role, profile changes), no user deletion, no impersonation.
- No review editing or player-facing moderation appeals; deletion is silent removal in MVP.
- No CSV export, no cross-entity full-text search, no audit log of admin actions (candidate for a later change).
- No changes to the dispute or verification flows themselves.

## Decisions

### D1: Console lives under `/dashboard/admin/*`, existing queues move in

New route group `apps/web/app/[locale]/dashboard/admin/{users,transactions,analytics,reviews}` plus an admin section in the dashboard nav (rendered only for `Role.ADMIN`). The existing `/dashboard/verification` and `/dashboard/disputes` pages are linked from the same nav section but **not moved** — relocating them would churn change-9/change-4 code and translations for zero behavior gain. Alternative (separate `apps/admin` Next app) rejected: MVP overhead, duplicated auth/i18n plumbing.

### D2: Single `admin` API module grows; disputes stay where they are

New endpoints go into `apps/api/src/admin` (users, transactions, analytics, review moderation), keeping the one `@Roles(Role.Admin)` controller entry point per concern:

- `GET /admin/users?query&role&page` — paginated directory; `query` matches email/displayName (case-insensitive contains).
- `GET /admin/users/:id` — account basics + player/pro profile summary + counters (sessions by status, payments).
- `POST /admin/users/:id/suspend` / `POST /admin/users/:id/unsuspend`.
- `GET /admin/payments?status&page` — ledger, newest first, joined with session + party display names.
- `GET /admin/analytics` — one aggregate snapshot (see D5).
- `GET /admin/reviews?query&page`, `DELETE /admin/reviews/:id` (body: required reason).

Alternative (spreading endpoints across `users`/`payments`/`reviews` modules) rejected: admin read models join across entities and don't fit the user-scoped services; one module keeps the admin attack surface auditable.

### D3: Suspension = `User.suspendedAt` timestamp, enforced at token issue/refresh

Schema: nullable `suspendedAt DateTime?` on `User`. Suspend sets it and deletes all the user's refresh tokens in one transaction; unsuspend nulls it. Enforcement points:

1. Login (password and OAuth): suspended → 403 with a dedicated error code (localized message on the web).
2. Refresh: suspended → 401, token not rotated.

Access tokens are short-lived JWTs; we accept that an already-issued access token stays valid until expiry rather than adding a per-request DB check to `JwtAuthGuard`. Admins cannot suspend themselves or other admins (guard in service) — prevents lockout of the seeded admin. Alternative (a `status` enum) rejected: one boolean-with-timestamp is enough and doubles as "when".

### D4: Review deletion is a hard delete + aggregate decrement in one `$transaction`

`prisma.$transaction`: `delete Review where id` returning `rating`/`proProfileId`, then `ProProfile.update` with `ratingSum: { decrement: rating }, ratingCount: { decrement: 1 }`. Deleting an already-deleted review → 404, no aggregate touch (delete-first ordering makes double-decrement impossible). The reason is required in the DTO and logged (structured log) — no moderation table in MVP (Non-Goal: audit log). Alternative (soft-delete flag) rejected: every public read path (listing, aggregate, count) would need filtering; hard delete keeps change 10's invariant "aggregate == stored reviews" trivially true.

### D5: Analytics computed on demand, no snapshot tables

`GET /admin/analytics` runs a handful of `groupBy`/`aggregate` queries in parallel: users by role (+ suspended count), sessions by status, disputes open/resolved (by outcome), payment totals by status per currency (held/released/refunded sums, fee revenue = sum of `feeMinor` over released payments), and a 30-day daily series of created sessions and released amounts. Data volumes are tiny in MVP; precomputed rollups are premature. Money totals are returned grouped per currency in minor units — the API never sums across currencies; the UI renders one row per currency.

### D6: Web UI: same Notion-style dashboard components, server-side pagination

Tables follow existing dashboard patterns (`bookings-list.tsx`, `admin-disputes.tsx`): pastel status tags, emoji section icons, page-based pagination via query params. Analytics uses stat cards + a simple bar/line rendered without a chart dependency (CSS bars), consistent with the design system. All new strings in `messages/{en,fr,de,ru,zh}.json` under an `adminConsole` namespace.

## Risks / Trade-offs

- [Stale access token after suspension: user keeps API access up to access-token TTL] → TTL is short (existing auth design); acceptable for MVP, noted for a future per-request revocation check if abuse appears.
- [Hard-deleted reviews are unrecoverable and leave no record] → deletion reason is required and logged; a proper moderation audit log is explicitly deferred.
- [On-demand analytics scans grow with data volume] → fine at MVP scale; indexes on `Payment.status`, `Session.status`, `createdAt` cover the group-bys; revisit with rollups when slow.
- [Suspending a user with live sessions/escrow does not cancel or refund anything] → intentional: money flows stay in their own state machines; admins resolve those via the existing dispute/cancellation paths. Suspension only blocks sign-in.
- [Directory search is `contains` on email/name, unindexed] → acceptable at MVP scale; trigram index later if needed.

## Migration Plan

1. Prisma migration adds `User.suspendedAt` (nullable — no backfill, no downtime concern).
2. API and web ship together in one change; no data migration, no rollback steps beyond reverting the migration.

## Open Questions

None — scope questions (suspension semantics, hard vs soft delete, no audit log) are decided above; anything larger (audit log, payout exports) belongs to a future change.
