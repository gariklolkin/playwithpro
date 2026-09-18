## Why

Users cannot delete their account or download their data, and a hand-written `DELETE` on `User` would either fail on the Restrict foreign keys or cascade into payments and disputes. GDPR erasure and portability requests (Art. 15, 17, 20) would today mean manual SQL and object-storage work on production. GitHub issue [#8](https://github.com/gariklolkin/playwithpro/issues/8). Building it before real users means nothing to backfill and a pattern every later change plugs into.

## What Changes

- **Deletion = anonymization plus targeted erasure**, never a row delete. The account becomes a tombstone (`deleted-<id>@invalid`, empty name, `deletedAt`, no credentials); sessions, payments, disputes, attendance, reviews and legal acceptances stay, linked to the tombstone id and shown as "Former member". Player profile, coach services, availability, credentials, videos (original and playback), the whole `avatars/<userId>/` prefix and any scheduled verification call go.
- **Self-service with a grace period** (`ACCOUNT_DELETION_GRACE_DAYS`, default 14): blockers first (a session in `paid_escrow` / `in_progress` / `awaiting_confirmation` / `disputed` on either side, a `HELD` payment), re-authentication (password, or a 6-digit email code for Google-only accounts), a typed confirmation word, the list of what goes and what stays. At request time every other session is signed out, unpaid bookings are cancelled, a coach leaves the catalog and their open future slots are removed, a scheduled verification call is withdrawn, and a signed-in user sees only "scheduled for deletion" with **Cancel deletion** and **Download my data**. Cancelling restores the account. The API refuses commitment actions during the grace period with `account_deletion_pending`.
- **Execution job** (hourly, guarded): due requests are re-checked — a new blocker postpones by 7 days and emails the user — then run through the **erasure hooks**, each step recorded and idempotent so a failed run resumes; the completion email goes out before the address is scrubbed.
- **Erasure hooks.** An `AccountErasureHook` interface with a multi-provider registry; this change ships the core hooks (credentials, profiles, availability, verification, videos, avatars, tombstone) and an observability hook that erases the PostHog person when a personal API key is configured and records "skipped" otherwise. Recordings, annotations, messages and Fider add theirs in their own changes.
- **Admin-initiated deletion** from the user detail with a required reason and a chosen grace (default 14 days, or immediate); admins cannot delete themselves and the last admin cannot be deleted. A read-only **request log** (`AccountDataRequest`: kind, status, initiator, reason, times, per-step results) in the console with a retry for failed steps.
- **Data export**: `POST /users/me/export` (one per 24 h) builds `account.json` + `videos.json` in a zip under `exports/<userId>/<jobId>.zip` (no media copies; per-video download links stay available), emails "your export is ready" with a link to the signed-in account settings where a short-lived pre-signed URL is handed out; the file expires after 7 days and a sweep removes it.
- **Retention statement:** backups under `backups/` expire after 30 days by an object-storage lifecycle rule (script + README), completed deletions are re-applied after a restore (documented), the mailer stops logging recipient addresses.
- **Emails ×5 (sessionless outbox kinds):** deletion requested (with the cancel link), cancelled, postponed, completed (direct send before the scrub), admin-initiated notice, export ready.
- **UI ×5 locales:** an **Account** tab in the settings dialog (delete card with blockers/re-auth/confirmation, export card), the grace-period screen, "Former member" wherever a party or author is shown, admin user detail actions and the request log.

Out of scope: legal texts (#7), rectification/restriction flows, DPAs, inactive-account purging, recording/annotation/message erasure (their own hooks), Fider erasure (hook slot only), erasure at a real payment provider, editing existing backups.

## Capabilities

### New Capabilities

- `account-data-rights`: the inventory and erasure hooks, deletion request lifecycle (blockers, re-authentication, grace period, execution, postponement), export, audit log, tombstone semantics.

### Modified Capabilities

- `user-accounts`: the Account settings tab (delete, export), the tombstone identity, the grace-period screen.
- `auth`: sign-in during the grace period, credential removal at execution, the same email may sign up again.
- `pro-catalog`: coaches with a pending deletion or a tombstone never appear.
- `availability`: rules deleted and future open slots removed at request time.
- `verification-scheduling`: a scheduled call is withdrawn (Google event deleted) at request time.
- `video-library`: all videos purged at execution; coach access to a deleting player's clips ends at request time.
- `reviews`: reviews by a deleted player keep rating and text with the author shown as "Former member"; a deleted coach's reviews are no longer public.
- `admin-console`: admin-initiated deletion, the request log, "Former member" in ledger/disputes/directory.
- `production-deploy`: backup lifecycle rule and the restore re-apply note.

## Impact

- **DB (migration `add_account_data_requests`):** `AccountDataRequest` + enums; `User.deletionScheduledFor`, `User.deletedAt`; six `NotificationKind` values; `VerificationToken.kind` gains `account_deletion`.
- **API:** `AccountDataModule` (`AccountDeletionService`, `AccountExportService`, `AccountRequestsService`, hooks registry + core hooks, `ActiveAccountGuard`, controllers), `StorageService.deletePrefix/listPrefix`, `TokenService` code kind, catalog/pro/availability filters, tombstone-aware mappers, mailer log scrub, dispatcher sessionless kinds; env `ACCOUNT_DELETION_GRACE_DAYS`, `ACCOUNT_DELETION_POSTPONE_DAYS`, `ACCOUNT_EXPORT_TTL_DAYS`, `ACCOUNT_EXPORT_COOLDOWN_HOURS`, `POSTHOG_PERSONAL_API_KEY` (optional).
- **Shared:** `AccountDataRequestKind/Status`, `DeletionBlocker`, `DeletionStatusResponse`, `ExportStatusResponse`, request types, `MeResponse.deletionScheduledFor`, `AdminAccountRequestItem`; `FORMER_MEMBER` sentinel handling.
- **Web:** settings Account tab, `DeletionGate` in the locale layout, "Former member" rendering, admin actions + request log; catalogs ×5.
- **Infra:** `infra/k8s/postgres/backup-lifecycle.json` + apply script, README notes.
