# reviews Specification

## Purpose
Post-session player reviews: a 1–5 star rating with optional text for sessions whose escrow was paid out to the coach, at most one per session, feeding a drift-free aggregate coach rating surfaced publicly on the catalog and coach page — localized in five locales.

## Requirements

### Requirement: Player reviews a paid-out session
The session's player SHALL be able to leave exactly one review — an integer rating from 1 to 5 and optional text up to 2000 characters — for a session whose escrow outcome was a payout to the coach: status `completed_paid`, or `resolved` with the release outcome. Sessions in any other status, and `resolved` sessions with the refund outcome, SHALL NOT be reviewable (conflict). Eligibility SHALL be judged on session status only — a payout retry pending on the payment row SHALL NOT block reviewing — and the review action SHALL apply the same inline progression normalization as other session paths, so a session past its auto-confirm deadline becomes reviewable in the same request. Only the session's player MAY review it: the coach is rejected, and any other user's request yields not-found. A second review for the same session SHALL be rejected with a conflict even under concurrent submission. Reviews are immutable in this change: no user-facing edit or delete.

#### Scenario: Review after confirmation
- **WHEN** the player of a `completed_paid` session submits a rating of 5 with text
- **THEN** the review is stored with the rating, text, and creation time, linked to the session

#### Scenario: Review after a dispute resolved for the coach
- **WHEN** the player of a `resolved` session whose dispute outcome was release submits a review
- **THEN** the review is accepted

#### Scenario: Refunded session not reviewable
- **WHEN** the player attempts to review a `resolved` session whose dispute outcome was refund
- **THEN** the request is rejected with a conflict and no review is stored

#### Scenario: Unfinished session not reviewable
- **WHEN** the player attempts to review a session that is `awaiting_confirmation` and not yet past its auto-confirm deadline
- **THEN** the request is rejected with a conflict

#### Scenario: Stale session normalized then reviewed
- **WHEN** the player reviews a session whose auto-confirm deadline has passed but the sweep has not run
- **THEN** the session is auto-completed first and the review is accepted in the same request

#### Scenario: Second review rejected
- **WHEN** the player submits a review for a session that already has one
- **THEN** the request is rejected with a conflict and the original review is unchanged

#### Scenario: Invalid rating rejected
- **WHEN** the player submits a rating outside 1–5 or text longer than 2000 characters
- **THEN** the request is rejected with a validation error

#### Scenario: Coach cannot review
- **WHEN** the session's coach attempts to submit a review for it
- **THEN** the request is rejected as forbidden

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

### Requirement: Public reviews listing
The system SHALL publicly expose a paginated, newest-first list of a verified coach's reviews — rating, text, player display name, service type, and session date — to any visitor, including anonymous ones. Requesting reviews of a non-verified or non-existent profile SHALL yield not-found.

#### Scenario: Visitor reads reviews
- **WHEN** an anonymous visitor opens a verified coach's reviews
- **THEN** they see reviews newest first with rating, text, player name, service type, and date, paginated

#### Scenario: Unverified coach's reviews hidden
- **WHEN** a visitor requests reviews of an unverified profile
- **THEN** the request yields not-found

### Requirement: Localized review experience
The review surfaces — the review form with star input and validation, star displays, the coach-page reviews section, and rating aggregates — SHALL render from next-intl catalogs in all five locales with no hard-coded strings, showing dates in the viewer's timezone.

#### Scenario: Localized review form
- **WHEN** a player opens the review form in any supported locale
- **THEN** the form, star labels, and validation messages render from that locale's catalog
