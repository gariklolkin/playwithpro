## ADDED Requirements

### Requirement: Review notifications
When a session's escrow is released to the coach, the player's completion email SHALL invite them to leave a review with a link to the session. When a player submits a review, the coach SHALL be emailed the rating with a link to their coach page; the review text SHALL NOT be included. The review-received email is optional and switchable in the coach's notification preferences.

#### Scenario: Review request after payout
- **WHEN** a session completes and the payment is released
- **THEN** the player's email contains a leave-a-review link to the session

#### Scenario: Coach notified of a new review
- **WHEN** a player submits a 4-star review
- **THEN** the coach receives an email stating the rating and linking to the coach page, without the review text
