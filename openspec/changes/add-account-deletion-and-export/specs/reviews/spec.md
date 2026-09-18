## ADDED Requirements

### Requirement: Reviews around deletion
A review written by a deleted player SHALL keep its rating and text with the author shown as "Former member"; the coach's rating aggregate SHALL be unchanged. Reviews received by a deleted coach SHALL remain in the records but SHALL NOT be publicly listed, since the coach page is gone.

#### Scenario: Reviewer deleted
- **WHEN** a player who reviewed a coach is deleted
- **THEN** the coach's page still shows the rating and the text under "Former member" and the same average
