# user-accounts Delta Spec

## ADDED Requirements

### Requirement: Account avatar
The system SHALL let any authenticated user (amateur or professional) set a profile avatar via a pre-signed upload URL to S3-compatible storage, restricted to JPEG/PNG/WebP with a maximum size of 5 MB, and SHALL let them replace or remove it. The upload SHALL be a two-step flow: request a pre-signed URL, upload directly to storage, then confirm to attach the object to the account.

#### Scenario: Successful avatar upload
- **WHEN** a user requests an upload URL for a 1 MB PNG, uploads it, and confirms
- **THEN** the avatar is attached to the account and returned on subsequent reads

#### Scenario: Disallowed content type
- **WHEN** a user requests an upload URL for a `video/mp4` file
- **THEN** the request is rejected with a validation error and no URL is issued

#### Scenario: Remove avatar
- **WHEN** a user removes their avatar
- **THEN** subsequent reads return no avatar and the UI falls back to initials

### Requirement: Avatar in public identity
Wherever the system exposes a user's public identity (display name), it SHALL also expose the avatar URL when one is set; UI surfaces SHALL render an initials placeholder when it is not.

#### Scenario: Identity payload includes avatar
- **WHEN** an endpoint returns a user's display name to another authorized user
- **THEN** the payload includes the avatar URL or a null value, never a broken link

#### Scenario: No avatar set
- **WHEN** a user without an avatar appears in any UI surface
- **THEN** an initials placeholder is rendered
