# auth — delta for add-verification-scheduling

Email verification becomes a hard gate: unverified accounts have no session at all. The whole verification-scheduling flow (booking confirmations, reminders, meeting invites) depends on a working email address, and this also keeps unreachable users out of admin queues.

## MODIFIED Requirements

### Requirement: Email and password registration
The system SHALL allow a visitor to register with email, password (min 8 chars), display name, and a role choice of amateur or professional, without requiring any third-party account. Registration SHALL NOT sign the user in: the account becomes usable only after the email address is confirmed, and the UI tells the user to check their inbox.

#### Scenario: Successful registration
- **WHEN** a visitor submits valid registration data
- **THEN** a user is created with the chosen role, a verification email is sent, and no session is issued until the email is confirmed

#### Scenario: Duplicate email
- **WHEN** a visitor registers with an email that already exists
- **THEN** the request fails with a generic error that does not reveal whether the email is registered

### Requirement: Email verification
The system SHALL send a single-use, time-limited (1 hour) verification link and record the verification timestamp when used. Verification is required for any access: login with a correct password but an unconfirmed email SHALL be rejected with a forbidden error offering to resend the link, refresh-token rotation SHALL invalidate sessions of unverified accounts, and opening a valid verification link SHALL confirm the address and sign the user in (possessing the emailed token proves mailbox ownership). Google OAuth accounts are verified by the provider and sign in normally.

#### Scenario: Unverified login
- **WHEN** a user with a correct password but an unconfirmed email logs in
- **THEN** the request is rejected with a forbidden error and the UI offers to resend the confirmation email

#### Scenario: Verification signs the user in
- **WHEN** a user opens a valid verification link
- **THEN** the email is marked verified, auth cookies are set, and the user can proceed to the dashboard

#### Scenario: Link used twice
- **WHEN** a verification link is opened a second time
- **THEN** the system rejects it and offers to resend a fresh link
