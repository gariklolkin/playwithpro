## ADDED Requirements

### Requirement: Departing coaches are hidden
A coach whose deletion is scheduled or executed SHALL NOT appear in the catalog, SHALL NOT have a public coach page, and SHALL NOT list public open slots, from the moment the request is accepted.

#### Scenario: Catalog after a request
- **WHEN** a verified coach's deletion request is accepted
- **THEN** their card is gone from the catalog and their page yields not-found
