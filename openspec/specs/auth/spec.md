# auth Specification

## Purpose
Identify users and control access: email+password and Google OAuth sign-in, verified emails, rotating JWT sessions, password reset, and role-based authorization (amateur | professional | admin).

## Requirements

### Requirement: Email and password registration
The system SHALL allow a visitor to register with email, password (min 8 chars), display name, and a role choice of amateur or professional, without requiring any third-party account.

#### Scenario: Successful registration
- **WHEN** a visitor submits valid registration data
- **THEN** a user is created with the chosen role, a verification email is sent, and the user is signed in

#### Scenario: Duplicate email
- **WHEN** a visitor registers with an email that already exists
- **THEN** the request fails with a generic error that does not reveal whether the email is registered

### Requirement: Email verification
The system SHALL send a single-use, time-limited (1 hour) verification link and record the verification timestamp when used. Unverified users MAY log in, but capabilities marked as requiring verification remain blocked.

#### Scenario: Link used twice
- **WHEN** a verification link is opened a second time
- **THEN** the system rejects it and offers to resend a fresh link

### Requirement: Login and session tokens
The system SHALL authenticate users via email/password and issue a short-lived access token (≤15 min) and a rotating refresh token (≤30 days), both delivered as httpOnly cookies. Tokens SHALL never be exposed to client-side JavaScript.

#### Scenario: Successful login
- **WHEN** valid credentials are submitted
- **THEN** access and refresh cookies are set and the user's role is available to the client via `GET /users/me`

#### Scenario: Invalid credentials
- **WHEN** the email or the password is wrong
- **THEN** the same generic error is returned in both cases

### Requirement: Refresh token rotation with reuse detection
The system SHALL rotate the refresh token on every refresh, store only token hashes, and revoke all of a user's refresh tokens if a previously-rotated token is presented.

#### Scenario: Stolen token replay
- **WHEN** an already-rotated refresh token is presented
- **THEN** every active session of that user is revoked and re-authentication is required

### Requirement: Google OAuth sign-in (optional)
The system SHALL offer Google OAuth as an optional sign-in method with scopes limited to `openid email profile`. A Google account with an email matching an existing verified user SHALL be linked to that user; otherwise a new user is created after the visitor picks a role. Google SHALL never be required to use the platform.

#### Scenario: First-time Google sign-in
- **WHEN** a visitor authenticates with Google and no user exists for that email
- **THEN** they are asked to choose amateur or professional, after which the account is created, marked email-verified, and signed in

#### Scenario: Google email matches existing account
- **WHEN** the Google email matches an existing verified user
- **THEN** the Google account is linked and the user is signed in as that user

#### Scenario: Unlink guard
- **WHEN** a user with no password attempts to unlink their only Google account
- **THEN** the request is rejected until a password is set

### Requirement: Password reset
The system SHALL provide a forgot/reset flow using single-use, time-limited (1 hour) emailed tokens; a successful reset SHALL revoke all refresh tokens.

#### Scenario: Reset completes
- **WHEN** a user sets a new password via a valid reset link
- **THEN** the password is updated, all sessions are revoked, and the user can log in with the new password

### Requirement: Role-based authorization
The system SHALL enforce roles (amateur, professional, admin) on API endpoints via guards; role information SHALL come only from the verified access token.

#### Scenario: Forbidden role
- **WHEN** an amateur calls an admin-only endpoint
- **THEN** the API responds 403 without leaking endpoint semantics

### Requirement: Auth abuse protection
The system SHALL rate-limit registration, login, and password-forgot endpoints per IP.

#### Scenario: Brute force attempt
- **WHEN** login attempts from one IP exceed the limit
- **THEN** subsequent attempts are rejected with 429 for the cool-down window
