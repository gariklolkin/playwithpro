## Context

`User` is referenced with Restrict FKs by sessions, reviews and disputes (the money and dispute trail); videos, profiles, tokens and OAuth links cascade or are owned. Object storage holds `avatars/<userId>/…`, `videos/<userId>/…` and nightly `backups/`. Suspension exists (tokens revoked, sign-in blocked) but keeps every byte. `VideosService.purge` removes one video's objects and row. Verification withdrawal cancels the Google event. The outbox needs a session for most kinds; `LEGAL_UPDATE_NOTICE` (change 30) established the sessionless path.

## Goals / Non-Goals

**Goals:** one tested erasure path that keeps the ledger consistent; a request lifecycle with blockers, re-authentication and a grace period; an export that covers the inventory; every step recorded and resumable; hooks so later features plug in; a documented backup retention.

**Non-Goals:** rewriting backups; erasure at third parties without an API key; a human-readable export.

## Decisions

### D1. Tombstone, not delete
Execution ends with `user.update({ email: 'deleted-<id>@invalid', displayName: '', passwordHash: null, avatarKey: null, locale: 'en', timezone: 'UTC', emailVerifiedAt: null, deletedAt: now, deletionScheduledFor: null, email preferences off })`. Restrict FKs are satisfied, aggregates (coach rating, session counts) do not drift, and the counterpart's history stays. Readers show an empty display name as "Former member" through one web helper (`formerMember(name, t)`) used by the session card, review list, catalog/coach page, admin ledger, disputes and directory — the string lives in the catalogs, never in the database.

### D2. Blockers are money and attendance, computed in one query
`blockers(userId)` returns sessions where the user is player or coach in `PAID_ESCROW | IN_PROGRESS | AWAITING_CONFIRMATION | DISPUTED`, and `HELD` payments on any of the user's sessions. The list is returned as `409 { code: 'account_deletion_blocked', blockers: [...] }` with session ids, service and times, so the UI can link. `PENDING_PAYMENT` sessions are not blockers: the request cancels them (the existing unpaid release).

### D3. Request time does the visible part; execution does the irreversible part
At request (one transaction + follow-ups): `AccountDataRequest(DELETION, SCHEDULED, scheduledFor = now + grace)`, `User.deletionScheduledFor`, revoke all refresh tokens, cancel unpaid sessions, delete availability rules and mark future `OPEN` slots `REMOVED`, withdraw a scheduled verification call (Google event deleted). Catalog, coach page, public slots and coach access to the player's clips filter on `deletionScheduledFor IS NULL AND deletedAt IS NULL`. Cancelling clears `deletionScheduledFor` and marks the request `CANCELLED`; rules and slots are not resurrected (the coach republishes) — stated in the dialog.

### D4. Guarding the grace period
`ActiveAccountGuard` (after auth) on the same commitment routes as `LegalGuard` plus video upload initiation: `409 account_deletion_pending`. Sign-in stays possible (the web shows only the grace screen: cancel or export), so the user can change their mind without support. Access tokens are short-lived; refresh is refused while `deletionScheduledFor` is set? No — refresh must keep working so the grace screen works; only *other* sessions are signed out at request time (all refresh tokens revoked; the requesting browser gets a fresh pair from the request response).

### D5. Execution: hooks, recorded steps, resumable
`AccountErasureHook { name: string; erase(userId, ctx): Promise<void> }` registered as a multi-provider (`ACCOUNT_ERASURE_HOOKS`). Order: `credentials` (tokens, OAuth, verification tokens), `player-profile`, `pro-profile` (services deleted, bio/languages cleared, status unchanged), `availability`, `verification` (scheduled bookings cancelled, admin notes cleared), `videos` (`VideosService.purge` per row), `avatars` (`deletePrefix`), `observability` (PostHog person delete when `POSTHOG_PERSONAL_API_KEY` is set, else `skipped`), then the tombstone. `AccountDataRequest.steps` is JSON `{ [name]: { status: 'done'|'failed'|'skipped', at, error? } }`; a run skips `done` steps, retries the rest, and the request is `FAILED` (retryable from the console) if any step failed after the tombstone would have been reached — the tombstone runs only when every prior step is done. The completion email is delivered directly (not queued) right before the tombstone; every other email goes through the outbox with `sessionId: null`.

### D6. Re-authentication
Password accounts send `password` (argon2 verify). Google-only accounts request a code (`POST /users/me/deletion/code` → `VerificationToken` kind `account_deletion`, the existing 6-digit code machinery) and send `code`. The confirmation word is client-side UX only; the API's proof is the credential.

### D7. Export as a job with a dependency-free zip
`AccountExportService.build(userId)` gathers the inventory (account, profiles, services, availability, sessions as a party — counterpart display name only — payments, reviews written/received, disputes opened, attendance, verification history, legal acceptances) into `account.json`, and `videos.json` (titles, metadata, no media). A ~60-line STORE-method zip writer (`node:zlib`'s `crc32`) avoids a dependency for two small JSON members. Stored at `exports/<userId>/<requestId>.zip`; `GET /users/me/export` returns status and, when ready, a 10-minute pre-signed URL; the email links to `/dashboard?settings=account`. Cooldown 24 h, TTL 7 days, expired objects deleted by the sweep. Exports run in the same hourly job (and immediately after the request in-process, best effort).

### D8. Admin
`POST /admin/users/:id/deletion { reason, graceDays? }` — same request path with `initiatedBy: ADMIN`, `adminId`, `reason`; `graceDays: 0` executes on the next job tick. Refused for admins (self or other) unless another active admin exists, and never for the last admin. `GET /admin/account-requests`, `POST /admin/account-requests/:id/retry`.

### D9. Backups and logs
`infra/storage/backup-lifecycle.json` + `scripts/apply-backup-lifecycle.sh` (`aws s3api put-bucket-lifecycle-configuration`, prefix `backups/`, 30 days); README documents applying it and re-running completed `AccountDataRequest` rows after a restore (`pnpm --filter api run account-requests:reapply` — a small script that re-executes COMPLETED deletions idempotently). `MailerService` logs the recipient's user id, never the address.

## Risks / Trade-offs

- [A coach with many future bookings cannot leave] → blockers are explicit with links; the coach cancels (full refund, players notified) or delivers; support can force-majeure cancel.
- [Grace period vs. one-month deadline] → 14 days default, admins can run immediately on request.
- [Third parties without keys] → recorded as `skipped` in the log so the operator knows what was not erased.
- [Zip writer edge cases] → STORE only, ASCII names, sizes < 4 GB; unit-tested against `node:zlib` inflate-free reading (headers parsed back).

## Migration Plan

Additive migration. The lifecycle rule is applied by the operator (script). Rollback: old code ignores the new columns; pending requests simply stop being executed.

## Open Questions

Counsel's retention list from the issue (payments, disputes free text, attendance, reviews by deleted players, backup window, export format) — each with the default implemented here.
