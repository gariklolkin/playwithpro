## ADDED Requirements

### Requirement: Acceptance history on the user detail
The admin user detail view SHALL list the user's legal acceptances newest first with document, version, locale, context and time.

#### Scenario: History shown
- **WHEN** an admin opens the detail of a user who registered and later re-accepted the terms
- **THEN** both rows are listed with their versions, contexts and times
