## ADDED Requirements

### Requirement: Sign-in around a deletion
Sign-in (password and Google) SHALL keep working while a deletion is scheduled — the account is still the user's — and the response SHALL carry the scheduled date so the web shows the grace-period screen. Once the deletion is executed, the tombstone SHALL have no password, no Google link and an invalid email, so no sign-in path exists, and the original email address SHALL be free for a new registration.

#### Scenario: Grace-period sign-in
- **WHEN** a user with a scheduled deletion signs in
- **THEN** sign-in succeeds and the profile carries the scheduled deletion date

#### Scenario: Re-registration after deletion
- **WHEN** someone registers with the email of an executed deletion
- **THEN** a new account is created
