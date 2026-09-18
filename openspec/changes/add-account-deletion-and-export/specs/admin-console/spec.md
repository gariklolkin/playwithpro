## ADDED Requirements

### Requirement: Admin-initiated deletion and request log
An admin SHALL be able to schedule the deletion of a user from the user detail with a required reason and a chosen grace period (default 14 days, or immediate); the same blockers apply and the user is emailed. Admins SHALL NOT delete themselves and the last admin SHALL NOT be deleted. The console SHALL list deletion and export requests read-only with status, initiator, reason and failed steps, and SHALL offer a retry for failed requests. Ledger, disputes and directory SHALL show deleted users as "Former member".

#### Scenario: Admin schedules with a reason
- **WHEN** an admin deletes a user with the reason "request by email"
- **THEN** a deletion request with that admin's id and reason is scheduled and the user is emailed

#### Scenario: Last admin protected
- **WHEN** the only admin tries to delete their own account
- **THEN** the request is refused
