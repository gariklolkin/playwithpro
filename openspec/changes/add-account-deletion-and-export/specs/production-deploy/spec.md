## ADDED Requirements

### Requirement: Backup retention and restore re-apply
Database dumps under `backups/` SHALL expire after 30 days through an object-storage lifecycle rule applied by a documented script, and the operations documentation SHALL state that after a restore the completed deletion requests are re-applied before the application is opened to users.

#### Scenario: Lifecycle rule documented and applied
- **WHEN** the operator follows the backup section of the runbook
- **THEN** the lifecycle rule for the backups prefix is in place and the restore procedure includes re-applying completed deletions
