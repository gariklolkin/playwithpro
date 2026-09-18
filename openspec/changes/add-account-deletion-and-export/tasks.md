## 1. Data model, config, shared types

- [x] 1.1 Prisma: `AccountDataRequest` (+ `AccountDataRequestKind/Status/Initiator`), `User.deletionScheduledFor`, `User.deletedAt`, six `NotificationKind` values; migration `add_account_data_requests`
- [x] 1.2 Env: `ACCOUNT_DELETION_GRACE_DAYS` (14), `ACCOUNT_DELETION_POSTPONE_DAYS` (7), `ACCOUNT_EXPORT_TTL_DAYS` (7), `ACCOUNT_EXPORT_COOLDOWN_HOURS` (24), optional `POSTHOG_PERSONAL_API_KEY`; env examples
- [x] 1.3 Shared types: request kinds/statuses, `DeletionBlocker`, `DeletionStatusResponse`, `ExportStatusResponse`, `RequestDeletionRequest`, `AdminDeleteUserRequest`, `AdminAccountRequestItem`, `MeResponse.deletionScheduledFor`, error codes

## 2. API

- [x] 2.1 `StorageService.listPrefix/deletePrefix`; `TokenService` code kind `account_deletion`; mailer stops logging addresses
- [x] 2.2 `AccountErasureHook` + registry; core hooks (credentials, player-profile, pro-profile, availability, verification, videos, avatars, observability, tombstone); unit tests
- [x] 2.3 `AccountDeletionService`: blockers, re-auth, request (transaction + follow-ups), cancel, status; `ActiveAccountGuard` on booking/pay/availability/verification/upload; unit tests
- [x] 2.4 Execution job (hourly, guarded): re-check, postpone, resumable hook run, completion email before tombstone; unit tests
- [x] 2.5 `AccountExportService`: inventory gathering, zip writer, storage, status + pre-signed URL, cooldown, TTL sweep; unit tests
- [x] 2.6 Controllers: `GET/POST/DELETE /users/me/deletion`, `POST /users/me/deletion/code`, `GET/POST /users/me/export`; admin `POST /admin/users/:id/deletion`, `GET /admin/account-requests`, `POST /admin/account-requests/:id/retry`
- [x] 2.7 Visibility filters: catalog, coach page, public slots, coach clip access; `MeResponse`/sign-in carry the schedule; mappers tolerate the tombstone
- [x] 2.8 Emails ×5 for the six kinds; dispatcher sessionless path; completeness test
- [x] 2.9 e2e: request (blockers, re-auth, side effects), cancel, execute (tombstone + storage), postpone, export (contents, cooldown), admin path, re-registration, guard during grace

## 3. Web

- [x] 3.1 Settings Account tab: export card (request/status/download), delete card (blockers, consequences, re-auth password/code, confirmation word); vitest
- [x] 3.2 `DeletionGate` grace screen in the locale layout (cancel + export only); vitest
- [x] 3.3 "Former member" helper used by session cards, reviews, catalog/coach page, admin ledger/disputes/directory; vitest
- [x] 3.4 Admin: delete action on the user detail (reason, grace), request log page with retry; vitest
- [x] 3.5 Catalogs ×5; drift test

## 4. Infra and verification

- [x] 4.1 `infra/storage/backup-lifecycle.json` + `scripts/apply-backup-lifecycle.sh`; README: lifecycle, restore re-apply, `account-requests:reapply` script
- [x] 4.2 Lint, tsc, api unit + e2e, web vitest green; browser smoke: request deletion (blocked, then allowed), grace screen, cancel, export download, admin log
- [ ] 4.3 Roadmap entry 31; staging verification, then archive
