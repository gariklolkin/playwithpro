## ADDED Requirements

### Requirement: Coach agreement at verification submission
Submitting a profile for verification SHALL require accepting the current coach agreement: the verification card shows a required checkbox with a link, the request carries the accepted version, and the API refuses a missing or outdated version with `legal_version_outdated`, recording the acceptance with the verification-submission context otherwise.

#### Scenario: Submit without the agreement
- **WHEN** a coach calls the submission endpoint without the current agreement version
- **THEN** the request is refused and the profile stays a draft

#### Scenario: Submit with the agreement
- **WHEN** a coach ticks the box and submits
- **THEN** the profile is pending and an acceptance row for the coach agreement exists
