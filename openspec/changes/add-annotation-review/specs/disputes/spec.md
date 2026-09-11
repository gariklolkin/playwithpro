## MODIFIED Requirements

### Requirement: Admin dispute queue
The system SHALL provide admins a dispute queue listing open disputes with the session's parties, service type, session time, escrowed amount, dispute reason, and opening time, alongside the existing admin verification queue. Each entry SHALL surface the session's attendance evidence (join/leave entries) and, for video-analysis sessions, the annotation activity summary (annotated moments, per-author stroke counts with first and last times) to inform the decision. Resolved disputes SHALL be visible with their outcome.

#### Scenario: Admin reviews an open dispute
- **WHEN** an admin opens the dispute queue
- **THEN** open disputes are listed with parties, amounts, reasons, attendance evidence, and annotation activity for each session
