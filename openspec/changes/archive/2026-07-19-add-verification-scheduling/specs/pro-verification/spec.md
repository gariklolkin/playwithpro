# pro-verification — delta for add-verification-scheduling

Base: the `pro-verification` spec introduced by `add-pro-profiles-verification` (must be archived/synced before this change lands).

## MODIFIED Requirements

### Requirement: Verification submission
A coach SHALL be able to submit their profile for verification in one action — the profile itself (about, languages, services) is the material admins review; no extra free-text input is collected — but only when the coach's email address is verified, the profile is complete (at least one language, at least one active service; the "about" text is optional), and the profile is currently in `draft` or `rejected` status. Submission moves the profile to `pending_review` and the verification request to `AWAITING_SCHEDULING`. No messenger or phone contact is collected; the platform email is the only communication channel — which is why it must be confirmed before submission (and, defensively, before booking a slot). Any personal data shown to admins in the verification flow SHALL carry the note that it is visible to admins only and never published.

#### Scenario: Unconfirmed email
- **WHEN** a coach whose email is not yet verified tries to submit for verification
- **THEN** the submission is rejected with a forbidden error and the UI asks them to confirm the email first

#### Scenario: Incomplete profile
- **WHEN** a coach with no active services submits for verification
- **THEN** the submission is rejected with a conflict error explaining what is missing

#### Scenario: Resubmission after rejection
- **WHEN** a coach whose profile was rejected edits it and submits again
- **THEN** a new request is created in `AWAITING_SCHEDULING` and the profile returns to `pending_review`

#### Scenario: Double submission
- **WHEN** a coach submits while a request is already active (not `VERIFIED`, `REJECTED`, or `CANCELLED`)
- **THEN** the submission is rejected with a conflict error

### Requirement: Identity video call
Verification SHALL include a short (5–15 minute) video call scheduled by the coach: after submission the coach books one of the admin-published slots on the Verification page, and the meeting happens over the generated Google Meet link (see `verification-scheduling`). Approval is expected only after the call. Admins SHALL NOT need to contact the coach through personal messengers to arrange the call.

#### Scenario: Coach schedules the call
- **WHEN** a coach whose request is `AWAITING_SCHEDULING` opens the Verification page
- **THEN** they can pick an open slot in their timezone and book the call without any admin involvement

#### Scenario: No manual contact required
- **WHEN** a coach completes submission
- **THEN** no admin action is required before the coach can schedule, and no messenger contact is requested anywhere in the flow

### Requirement: Admin verification queue
Admins SHALL be able to list active verification requests with the associated profile, user summary and — when a call is booked — the meeting time and Meet link. The queue SHALL be ordered by meeting time, soonest first; requests without a booked call follow, oldest submission first. Admins approve or reject each request; approval is expected only around the identity call, so it is rejected while the request is still awaiting scheduling. Rejection requires a note; the note is visible to the coach. Approval marks the profile `verified`; rejection marks it `rejected`.

#### Scenario: Queue ordering and meet link
- **WHEN** an admin opens the queue with one unscheduled request submitted yesterday and one request whose call is booked for tomorrow
- **THEN** the scheduled request is listed first with its meeting time and Meet link, and the unscheduled one follows

#### Scenario: Approve
- **WHEN** an admin approves a request whose call is scheduled or in progress
- **THEN** the request records the reviewer and time, the profile becomes `verified`, and the coach is notified by email

#### Scenario: Approve before scheduling
- **WHEN** an admin approves a request that is still awaiting scheduling
- **THEN** the action is rejected with a conflict error

#### Scenario: Reject without note
- **WHEN** an admin rejects a request with an empty note
- **THEN** the request is rejected with a validation error and nothing changes

#### Scenario: Non-admin access
- **WHEN** a professional or amateur calls an `/admin/*` verification endpoint
- **THEN** the request is rejected with a forbidden error

### Requirement: Verification status visibility
A coach SHALL always see their current verification status in their profile view: profile status (`draft`, `pending_review`, `verified`, `rejected` with the admin's note) and, while `pending_review`, the request state — awaiting scheduling (with a prompt to book), scheduled (date, time, timezone, Join meeting and a single Change-or-withdraw link to the management page), in progress, or returned to scheduling after a no-show or an admin cancellation (with the reason).

#### Scenario: Scheduled card
- **WHEN** a coach with a booked call opens their profile
- **THEN** they see the meeting date and time in their timezone with Join meeting and a link that leads to changing the time or withdrawing the request

#### Scenario: Rejected coach sees the reason
- **WHEN** a coach opens their profile after a rejection
- **THEN** the status shows `rejected` together with the admin note
