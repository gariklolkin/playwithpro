# Tasks — add-admin-console

## 1. Schema & suspension enforcement

- [x] 1.1 Prisma migration: add nullable `suspendedAt DateTime?` to `User`
- [x] 1.2 Auth: reject suspended users at password sign-in and OAuth completion with a distinct suspension error code
- [x] 1.3 Auth: reject refresh for suspended users without rotating the token
- [x] 1.4 Unit tests: suspended sign-in (password + OAuth), suspended refresh, sign-in after unsuspension

## 2. Admin API — users

- [x] 2.1 `GET /admin/users` — paginated directory with role filter and email/name search (case-insensitive contains), returning email, display name, role, createdAt, suspendedAt
- [x] 2.2 `GET /admin/users/:id` — account basics, player/pro profile summary when present, session counts by status, payment attempt count
- [x] 2.3 `POST /admin/users/:id/suspend` — set `suspendedAt` and delete all refresh tokens in one transaction; reject admins and already-suspended accounts (conflict)
- [x] 2.4 `POST /admin/users/:id/unsuspend` — clear `suspendedAt`; reject non-suspended accounts (conflict)
- [x] 2.5 Unit tests: search/filter/pagination, detail counters, suspend/unsuspend guards (admin target, double suspend), token revocation

## 3. Admin API — transactions & analytics

- [x] 3.1 `GET /admin/payments` — paginated newest-first ledger with status filter, joined session + both parties' display names, amounts/fees in minor units
- [x] 3.2 `GET /admin/analytics` — parallel aggregates: users by role + suspended count, sessions by status, disputes open/resolved by outcome, per-currency money totals (held/released/refunded, fee revenue over released), 30-day daily series of created sessions and released amounts
- [x] 3.3 Unit tests: ledger filter/pagination, analytics per-currency grouping (never cross-currency sums), fee revenue counts only released payments

## 4. Admin API — review moderation

- [x] 4.1 `GET /admin/reviews` — paginated newest-first list with coach/player name search
- [x] 4.2 `DELETE /admin/reviews/:id` — required reason in DTO; `$transaction`: delete review, decrement `ProProfile.ratingSum` by rating and `ratingCount` by 1; 404 on missing review with no aggregate touch; structured log of reason
- [x] 4.3 Unit tests: aggregate decrement (incl. last-review → no rating yet), double deletion 404 without decrement, reason validation, non-admin denied

## 5. Web — console shell & users

- [x] 5.1 Admin nav section in the dashboard shell (admin role only): users, transactions, analytics, reviews + links to existing verification and disputes pages
- [x] 5.2 `/dashboard/admin/users` — searchable, role-filterable, paginated table with suspension badges
- [x] 5.3 User detail view — account basics, profile summary, activity counters, suspend/unsuspend action with confirmation
- [x] 5.4 Suspension error surfaced on the login page (suspension-specific localized message)

## 6. Web — transactions, analytics, reviews

- [x] 6.1 `/dashboard/admin/transactions` — paginated ledger table with status filter, formatted amounts, links to parties
- [x] 6.2 `/dashboard/admin/analytics` — stat cards (users, sessions, disputes, per-currency money totals) + CSS-bar 30-day trend
- [x] 6.3 `/dashboard/admin/reviews` — paginated review list with search and delete dialog (required reason)

## 7. i18n & verification

- [x] 7.1 `adminConsole` message namespace added to all five catalogs (en/fr/de/ru/zh); no hard-coded strings
- [x] 7.2 e2e: suspend flow (suspend → sign-in blocked → refresh blocked → unsuspend → sign-in ok)
- [x] 7.3 e2e: review deletion updates coach aggregate on catalog/coach page
- [x] 7.4 Lint, typecheck, full test suite green; manual pass over console pages in two locales
