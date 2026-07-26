# Add Admin Console

## Why

Admins currently have only two isolated tools (verification queue, dispute queue) buried in the shared dashboard. There is no way to look up a user, inspect the money trail of a session, see how the marketplace is doing, or remove an abusive review — the remaining duties of the Admin role ("oversees users and transactions", roadmap change 11). With bookings, escrow, payouts, and reviews all live, the platform now generates data that nobody can operate on.

## What Changes

- A dedicated admin console area in the web app with its own navigation, gathering the existing verification and dispute queues plus the new surfaces below. Admin-only, localized in all five locales.
- **Users**: paginated, searchable user directory (role/email/name filters) and a user detail view (account basics, profiles, session and payment counts). Admins can suspend and unsuspend accounts; suspension immediately revokes refresh tokens and blocks sign-in.
- **Transactions**: paginated payment ledger with status/provider filters — amount, currency, fee, status, provider reference, linked session and parties.
- **Analytics**: overview dashboard — user counts by role, session counts by status, dispute stats, and money totals (held / released / refunded, platform fee revenue) plus a recent-period trend.
- **Review moderation**: admin list of reviews with a delete action (reason required). Deleting a review decrements the coach's `ratingSum`/`ratingCount` in the same transaction so the aggregate never drifts.
- Disputes: no behavior change — the existing queue is linked into the console navigation.

## Capabilities

### New Capabilities

- `admin-console`: admin console shell/navigation, user directory with suspension, transaction ledger, and analytics overview.

### Modified Capabilities

- `reviews`: reviews were immutable; adds admin deletion with a mandatory aggregate decrement (`ratingSum`/`ratingCount`) in the same transaction.
- `auth`: authentication now rejects suspended accounts (sign-in, refresh) and suspension revokes existing refresh tokens.

## Impact

- **DB**: `User.suspendedAt` (nullable timestamp); no other schema changes. Review deletion is a hard delete inside a transaction that updates `ProProfile` aggregates.
- **API**: `apps/api/src/admin` module grows list/detail/suspend endpoints for users, payment listing, analytics aggregation, review deletion (all `Role.ADMIN`-guarded). Auth login/refresh paths gain a suspension check.
- **Web**: new admin console routes under the dashboard, admin components, next-intl catalog additions in all five locales.
- **Specs**: new `admin-console` spec; deltas to `reviews` and `auth`.
- Payments, sessions, disputes, and booking flows are read-only from the console — no money movement is initiated from it.
