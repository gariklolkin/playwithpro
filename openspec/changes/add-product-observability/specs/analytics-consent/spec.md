## ADDED Requirements

### Requirement: Observability provider abstraction
Both applications SHALL access analytics, error reporting and feature flags only through internal `Analytics`, `ErrorReporter` and `FeatureFlags` interfaces. A vendor implementation SHALL be selected only when its token is configured; otherwise a no-op implementation SHALL be used and no data SHALL leave the process. Business modules SHALL NOT import the vendor SDK directly.

#### Scenario: No token configured
- **WHEN** the web or API process starts without a PostHog token (local dev, CI)
- **THEN** no request is made to any ingestion host and all analytics, error and flag calls are no-ops

#### Scenario: Token configured
- **WHEN** the token is configured
- **THEN** the vendor implementation is used and every event carries `environment` and `release`

### Requirement: Consent before capture
The web app SHALL show a localized consent banner to visitors who have not recorded a choice, SHALL capture nothing (no pageviews, replay, or client events) before consent is granted, SHALL keep the app fully functional when consent is declined, and SHALL let the visitor change the choice later from the privacy page and, for signed-in users, from the user menu. The choice SHALL persist for at most twelve months and SHALL be re-asked when the consent text version changes.

#### Scenario: Declined consent sends nothing
- **WHEN** a visitor declines the banner and browses the app
- **THEN** no request reaches the ingestion proxy and the banner does not reappear during the persistence period

#### Scenario: Accepted consent starts capture
- **WHEN** a visitor accepts the banner
- **THEN** capture starts immediately without a reload, beginning with the current page

#### Scenario: Choice changed later
- **WHEN** a user who accepted revokes consent on the privacy page
- **THEN** capture stops and stored client identifiers are cleared

### Requirement: Privacy page
The web app SHALL serve a localized privacy page at `/privacy` in every locale listing what data is collected, by which vendor and region, for which purpose, and how to change the consent choice. The consent banner and the auth footers SHALL link to it.

#### Scenario: Privacy page in every locale
- **WHEN** a visitor opens `/privacy` in any supported locale
- **THEN** the page renders from that locale's catalog and offers the consent control

### Requirement: User identification
Signed-in users SHALL be identified to analytics by user id with role and locale as person properties; email SHALL be attached only when the user opens the support channel. Admin accounts and known test accounts SHALL be marked internal so they can be excluded from analysis. Signing out SHALL reset the client identity.

#### Scenario: Identify on sign-in
- **WHEN** a user with consent signs in
- **THEN** subsequent events are attributed to their user id with role and locale, and no email is sent

#### Scenario: Internal account marked
- **WHEN** an admin or a seeded smoke account is identified
- **THEN** the person carries an internal marker

### Requirement: Booking funnel and lifecycle events
The web app SHALL emit named funnel events for catalog view, coach page view, slot selection, checkout view, room joined and session confirmed, plus cancellation and dispute submission. The API SHALL emit the money and lifecycle events — session paid, completed, refunded, disputed and resolved — as the source of truth, keyed by the acting user id and carrying service type, amount and currency, but no free text.

#### Scenario: Full booking appears in the funnel
- **WHEN** a consenting player books, pays, joins the room and confirms a session
- **THEN** the funnel shows each step for that user and the paid and completed events come from the API

#### Scenario: Refund tracked server-side
- **WHEN** a session is refunded by settlement
- **THEN** a refunded event is emitted by the API even if no browser is open

### Requirement: Session replay masking and sanitizing
Session replay SHALL mask all form inputs, SHALL mask elements marked as sensitive (dispute text, player profile "about", the admin console), SHALL strip secrets from URLs before sending — password-reset codes, LiveKit access tokens and pre-signed object-storage signatures — in both the current-URL property and captured network requests, and SHALL apply sampling and a minimum recording length configured by environment.

#### Scenario: Masked replay
- **WHEN** a consenting player types a dispute reason and the admin reviews it
- **THEN** the replay shows masked text in both places

#### Scenario: No secrets in replay
- **WHEN** a replay covers a password reset and a session-room join
- **THEN** no reset code, LiveKit token or object-storage signature appears in the recording's URLs or network log
