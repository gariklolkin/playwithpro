# auth — delta for update-email-verification-code

Base: the `auth` spec as modified by the pending `add-verification-scheduling` delta (hard email gate, no session until confirmed).

## MODIFIED Requirements

### Requirement: Email and password registration
The system SHALL allow a visitor to register with email, password (min 8 chars), display name, and a role choice of amateur or professional, without requiring any third-party account. Registration SHALL NOT sign the user in: the account becomes usable only after the email address is confirmed via the emailed code, and the UI moves straight into code entry.

#### Scenario: Successful registration
- **WHEN** a visitor submits valid registration data
- **THEN** a user is created with the chosen role, a 6-digit confirmation code is emailed, and the same screen asks for the code; no session exists until the code is confirmed

#### Scenario: Duplicate email
- **WHEN** a visitor registers with an email that already exists
- **THEN** the request fails with a conflict error that plainly says the email is taken and points to login (consistent with the OAuth flow, which already reveals this)

### Requirement: Email verification
The system SHALL confirm email addresses with an emailed 6-digit code: single active code per user, 15-minute expiry, stored hashed, invalidated by resend, burned after 5 wrong attempts; the verify endpoint SHALL be rate-limited per IP. Submitting the correct code SHALL record the verification timestamp and sign the user in (typing the mailed code proves mailbox ownership); the UI then goes straight to the dashboard. All failures (unknown email, wrong, expired, or burned code) SHALL return the same generic error. Login with a correct password but an unconfirmed email SHALL be rejected with a forbidden error that leads to code entry and resend. Refresh-token rotation SHALL invalidate sessions of unverified accounts. Google OAuth accounts are verified by the provider and sign in normally.

#### Scenario: Code confirms and signs in
- **WHEN** a user submits the emailed 6-digit code with their email address
- **THEN** the email is marked verified, auth cookies are set, and the UI navigates to the dashboard

#### Scenario: Wrong code attempts
- **WHEN** a wrong code is submitted for the fifth time
- **THEN** the code is invalidated and further attempts fail until a new code is requested

#### Scenario: Resend invalidates the old code
- **WHEN** a user requests a new code
- **THEN** the previous code stops working and a fresh one is emailed

#### Scenario: Unverified login
- **WHEN** a user with a correct password but an unconfirmed email logs in
- **THEN** the request is rejected with a forbidden error and the UI offers code entry with a resend option
