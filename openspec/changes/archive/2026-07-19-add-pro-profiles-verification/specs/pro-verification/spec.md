# pro-verification — delta for add-pro-profiles-verification

## ADDED Requirements

### Requirement: Verification submission
A coach SHALL be able to submit their profile for verification with free-text credentials and at least one contact for an identity video call — Telegram and/or WhatsApp-phone (one field: WhatsApp is keyed by the phone number) — but only when the profile is complete (at least one language, at least one active service; the "about" text is optional) and currently in `draft` or `rejected` status. Submission moves the profile to `pending_review`.

#### Scenario: Incomplete profile
- **WHEN** a coach with no active services submits for verification
- **THEN** the submission is rejected with a conflict error explaining what is missing

#### Scenario: Resubmission after rejection
- **WHEN** a coach whose profile was rejected edits it and submits again
- **THEN** a new pending request is created and the profile returns to `pending_review`

#### Scenario: Double submission
- **WHEN** a coach submits while a request is already pending
- **THEN** the submission is rejected with a conflict error

### Requirement: Identity video call
Verification SHALL include a short video call: the admin can mark a pending request as "call requested", which emails the coach that they will be contacted via the contact they left. Approval is expected only after the call. Verification contacts SHALL be used solely for this call — they are visible to admins only and never published anywhere on the site; the submission form states this.

#### Scenario: Contacts stay private
- **WHEN** any non-admin user views a coach's profile or any public page
- **THEN** the verification contacts are not present in the response

#### Scenario: Call invitation
- **WHEN** an admin clicks "Invite to video call" on a pending request
- **THEN** the request records the invitation time and the coach receives an email mentioning their contact

### Requirement: Admin verification queue
Admins SHALL be able to list pending verification requests with the associated profile and user summary, and approve or reject each one. Rejection requires a note; the note is visible to the coach. Approval marks the profile `verified`; rejection marks it `rejected`.

#### Scenario: Approve
- **WHEN** an admin approves a pending request
- **THEN** the request records the reviewer and time, the profile becomes `verified`, and the coach is notified by email

#### Scenario: Reject without note
- **WHEN** an admin rejects a request with an empty note
- **THEN** the request is rejected with a validation error and nothing changes

#### Scenario: Non-admin access
- **WHEN** a professional or amateur calls an `/admin/*` verification endpoint
- **THEN** the request is rejected with a forbidden error

### Requirement: Verification status visibility
A coach SHALL always see their current verification status — `draft`, `pending_review`, `verified`, or `rejected` with the admin's note — in their profile view.

#### Scenario: Rejected coach sees the reason
- **WHEN** a coach opens their profile after a rejection
- **THEN** the status shows `rejected` together with the admin note
