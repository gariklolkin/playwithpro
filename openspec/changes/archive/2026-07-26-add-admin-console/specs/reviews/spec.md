# reviews Specification (delta)

## ADDED Requirements

### Requirement: Admin review moderation
The system SHALL provide admins a paginated, newest-first list of all reviews — rating, text, coach, player, and creation time, searchable by coach or player name — and SHALL allow an admin to delete a review with a required reason. Deletion SHALL permanently remove the review and, in the same transaction, decrement the coach profile's rating sum by the review's rating and the rating count by one, so the aggregate never drifts from the stored reviews. Deleting a non-existent (already deleted) review SHALL yield not-found and SHALL NOT touch the aggregate. Non-admin users SHALL NOT access review moderation.

#### Scenario: Review deleted with aggregate decrement
- **WHEN** an admin deletes a review with rating 5 from a coach with 2 reviews totalling 9
- **THEN** the review is gone from all listings and the coach's aggregate becomes 1 review with average 4.0

#### Scenario: Last review deleted
- **WHEN** an admin deletes a coach's only review
- **THEN** the coach is presented as having no rating yet, not a zero score

#### Scenario: Reason required
- **WHEN** an admin submits a deletion without a reason
- **THEN** the request is rejected with a validation error and the review remains

#### Scenario: Double deletion safe
- **WHEN** an admin deletes a review that was already deleted
- **THEN** the request yields not-found and the coach's aggregate is unchanged

#### Scenario: Non-admin denied
- **WHEN** a non-admin user requests the moderation list or a deletion
- **THEN** the request is denied

## MODIFIED Requirements

### Requirement: Aggregate coach rating
The system SHALL maintain each coach profile's aggregate rating — review count and average derived from integer sum and count columns updated in the same transaction as review creation and review deletion — so the aggregate never drifts from the stored reviews. The average SHALL be presented with one decimal. A coach with zero reviews SHALL be presented as having no rating yet, never as a zero score.

#### Scenario: Aggregate updates with a new review
- **WHEN** a coach with 1 review of rating 4 receives a review of rating 5
- **THEN** the coach's aggregate becomes 2 reviews with average 4.5

#### Scenario: Aggregate updates on deletion
- **WHEN** a review is deleted through admin moderation
- **THEN** the coach's aggregate reflects the remaining reviews in the same transaction as the deletion

#### Scenario: No reviews yet
- **WHEN** a coach without reviews is displayed anywhere ratings appear
- **THEN** a "no reviews yet" presentation is shown instead of a numeric score
