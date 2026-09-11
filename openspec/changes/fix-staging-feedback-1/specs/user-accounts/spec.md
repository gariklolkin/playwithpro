## ADDED Requirements

### Requirement: Avatar delivery
Avatar URLs returned by the API SHALL point at an API endpoint that validates the avatar key shape and redirects to a short-lived pre-signed storage URL with a cache lifetime shorter than the signature. Avatars SHALL NOT depend on anonymous read access to the storage bucket in any environment.

#### Scenario: Avatar renders on a private bucket
- **WHEN** a user with an avatar is shown anywhere in the UI against a bucket that denies anonymous reads
- **THEN** the image loads through the API redirect

#### Scenario: Malformed key rejected
- **WHEN** the avatar endpoint is requested with a key outside the avatars prefix
- **THEN** the request is rejected as not found
