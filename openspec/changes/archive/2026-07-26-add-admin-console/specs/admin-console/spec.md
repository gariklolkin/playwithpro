# admin-console Specification (delta)

## ADDED Requirements

### Requirement: Admin console area
The web app SHALL provide an admin console area within the dashboard, visible and accessible only to users with the admin role, gathering all admin surfaces in one navigation: user directory, transaction ledger, analytics overview, review moderation, and links to the existing verification and dispute queues. Non-admin users SHALL NOT see the console navigation, and requests to console pages or admin API endpoints by non-admins SHALL be denied.

#### Scenario: Admin sees the console
- **WHEN** an admin opens the dashboard
- **THEN** the navigation shows the admin console sections (users, transactions, analytics, reviews, verification, disputes)

#### Scenario: Non-admin denied
- **WHEN** a non-admin user requests an admin console page or admin API endpoint
- **THEN** the request is denied and no admin data is exposed

### Requirement: User directory
The system SHALL provide admins a paginated user directory listing every account with email, display name, role, registration date, and suspension state, filterable by role and searchable by email or display name (case-insensitive substring). The directory SHALL support opening a user detail view showing account basics (email, role, locale, timezone, email verification state, registration date), the linked player or pro profile summary when present, and activity counters (sessions by status, payment attempts).

#### Scenario: Search by email
- **WHEN** an admin searches the directory for a fragment of a user's email
- **THEN** matching users are listed with role, registration date, and suspension state, paginated

#### Scenario: Filter by role
- **WHEN** an admin filters the directory by the professional role
- **THEN** only professional accounts are listed

#### Scenario: User detail
- **WHEN** an admin opens a user's detail view
- **THEN** account basics, the linked profile summary when present, and session/payment counters are shown

### Requirement: Account suspension
An admin SHALL be able to suspend a non-admin account and to lift the suspension. Suspension SHALL record the suspension time and revoke all of the user's refresh tokens in the same operation, so the account cannot sign in or refresh its session while suspended. Suspending an already-suspended account or unsuspending a non-suspended one SHALL be rejected with a conflict. Admin accounts SHALL NOT be suspendable. Suspension SHALL NOT by itself alter the user's sessions, payments, or disputes — money flows continue through their existing state machines.

#### Scenario: Suspend a user
- **WHEN** an admin suspends an amateur account
- **THEN** the suspension time is recorded, the user's refresh tokens are revoked, and the directory shows the account as suspended

#### Scenario: Unsuspend a user
- **WHEN** an admin lifts a suspension
- **THEN** the account can sign in again

#### Scenario: Admin cannot be suspended
- **WHEN** an admin attempts to suspend an admin account
- **THEN** the request is rejected and no suspension is recorded

#### Scenario: Double suspension rejected
- **WHEN** an admin suspends an account that is already suspended
- **THEN** the request is rejected with a conflict

### Requirement: Transaction ledger
The system SHALL provide admins a paginated, newest-first ledger of all payment attempts showing amount and currency in integer minor units, platform fee snapshot, status, provider and provider reference, timestamps, and the linked session with both parties' display names, filterable by payment status. The ledger SHALL be read-only: no money movement SHALL be initiated from the admin console.

#### Scenario: Ledger listing
- **WHEN** an admin opens the transaction ledger
- **THEN** payment attempts are listed newest first with amount, fee, status, provider reference, and the linked session's parties, paginated

#### Scenario: Filter by status
- **WHEN** an admin filters the ledger by the refunded status
- **THEN** only refunded payments are listed

### Requirement: Analytics overview
The system SHALL provide admins an analytics overview reporting: user counts by role and suspended count, session counts by status, dispute counts (open, and resolved by outcome), and money totals grouped per currency in minor units — held, released, and refunded amounts plus platform fee revenue from released payments — along with a recent daily trend of created sessions and released amounts. Totals SHALL be computed from stored records; amounts of different currencies SHALL never be summed together.

#### Scenario: Overview snapshot
- **WHEN** an admin opens the analytics overview
- **THEN** user, session, and dispute counts and per-currency money totals are shown, with a recent daily trend

#### Scenario: Currencies kept separate
- **WHEN** payments exist in more than one currency
- **THEN** the overview shows one total per currency and no cross-currency sum

### Requirement: Localized admin console
The admin console surfaces SHALL render from next-intl catalogs in all five locales with no hard-coded strings, amounts formatted with their currency, and times shown in the viewer's timezone.

#### Scenario: Localized console
- **WHEN** an admin uses the console in any supported locale
- **THEN** all labels, statuses, and messages render from that locale's catalog
