## ADDED Requirements

### Requirement: Personal data inventory and erasure hooks
The system SHALL erase an account through a registry of erasure hooks, one per data location (credentials, player profile, coach profile and services, availability, verification calls and notes, videos and their stored objects, the avatar prefix, third-party processors), run in a fixed order with the tombstone last. Every hook SHALL be idempotent and its outcome (done, failed, skipped with a reason) SHALL be recorded on the request so a failed run resumes without redoing completed steps. Later features SHALL plug in by registering a hook.

#### Scenario: Resumed run
- **WHEN** the avatar step failed on the first run and the job runs again
- **THEN** the steps already done are skipped, the avatar step is retried, and the tombstone is written only once every step is done

#### Scenario: Processor without a key
- **WHEN** no PostHog personal API key is configured
- **THEN** the observability step is recorded as skipped with that reason and the deletion still completes

### Requirement: Deletion request with blockers, re-authentication and grace
A user SHALL be able to request the deletion of their account. The request SHALL be refused with a list of blockers while the user is a party of a session in `paid_escrow`, `in_progress`, `awaiting_confirmation` or `disputed`, or while a payment on one of their sessions is still held. The request SHALL require re-authentication — the password, or a six-digit emailed code for accounts without one. On acceptance the system SHALL, atomically with recording the request: schedule execution after the configurable grace period (default 14 days), sign out every other session, cancel the user's unpaid bookings, and for a coach delete availability rules, remove future open slots and withdraw a scheduled verification call. Admin accounts SHALL NOT use self-service deletion. The user SHALL be emailed with a cancellation link.

#### Scenario: Blocked by an open session
- **WHEN** a player with a session awaiting confirmation requests deletion
- **THEN** the request is refused with that session listed as a blocker and nothing changes

#### Scenario: Google-only account
- **WHEN** a user without a password requests deletion
- **THEN** they must enter the code emailed to them before the request is accepted

#### Scenario: Coach disappears at request time
- **WHEN** a verified coach's request is accepted
- **THEN** their card, page and open slots are gone from the public catalog, their rules are deleted, and a scheduled verification call is cancelled with its calendar event

### Requirement: Grace period and cancellation
While a deletion is scheduled the user SHALL still be able to sign in, but SHALL see only that the account is scheduled for deletion on the given date, with actions to cancel the deletion and to download their data; booking, paying, publishing availability, submitting for verification and uploading SHALL be refused with `account_deletion_pending`. Cancelling SHALL clear the schedule and restore the account (availability is republished by the coach). Reading paid sessions, confirming, disputing, reviewing and cancelling sessions SHALL stay possible.

#### Scenario: Cancel within the grace period
- **WHEN** the user cancels two days after requesting
- **THEN** the request is marked cancelled, the account works again, and a coach's profile is public again once availability is republished

#### Scenario: Booking during the grace period
- **WHEN** a user with a scheduled deletion tries to book
- **THEN** the request is refused with `account_deletion_pending`

### Requirement: Execution and postponement
A guarded periodic job SHALL execute due requests: it re-checks the blockers and, when one appeared, postpones execution by a configurable period (default 7 days) and emails the user; otherwise it runs the hooks and writes the tombstone — email replaced by `deleted-<id>@invalid`, name cleared, credentials and avatar removed, locale and timezone reset, `deletedAt` set — after sending the completion email. Sessions, payments, disputes, attendance, reviews and legal acceptances SHALL remain, linked to the tombstone, and the coach rating aggregate SHALL be unchanged. The same email address SHALL be able to register again afterwards.

#### Scenario: Executed after the grace period
- **WHEN** the job runs after the scheduled time with no blocker
- **THEN** the profile, credentials, videos and avatar objects are gone, the user row is a tombstone, and the user's payments and sessions still exist

#### Scenario: Blocker appeared meanwhile
- **WHEN** a dispute was opened on one of the user's sessions during the grace period
- **THEN** execution is postponed, the request records it, and the user is emailed

### Requirement: Data export
A user SHALL be able to request an export of their data at most once per 24 hours, also during a deletion grace period. The system SHALL build a zip with `account.json` (account, profiles, services, availability, sessions as a party with the counterpart's display name only, payments, reviews written and received, disputes opened, attendance, verification history, legal acceptances) and `videos.json` (titles and metadata; media stay downloadable through the existing endpoints), store it privately, email the user that it is ready with a link to the signed-in account settings, hand out a short-lived pre-signed URL there, and delete the file after 7 days.

#### Scenario: Export ready
- **WHEN** the job has built a coach's export
- **THEN** the account settings show a download link that expires shortly, the zip contains both files with every inventory section, and the email links to the settings, never to the raw URL

#### Scenario: Second export too soon
- **WHEN** the user requests another export within 24 hours
- **THEN** the request is refused with a conflict naming when the next one is possible

### Requirement: Request audit log
Every deletion or export request SHALL be recorded with its kind, status (scheduled, running, postponed, completed, cancelled, failed), initiator (self, or admin with id and reason), the request, scheduled, cancelled, completed and postponed times, and the per-step results. The log SHALL reference the user id only, so it survives the tombstone, and SHALL never hold an email or a name.

#### Scenario: Admin reviews a failed step
- **WHEN** an admin opens the request log after a deletion whose storage step failed
- **THEN** the request shows status failed with that step's error and offers a retry
