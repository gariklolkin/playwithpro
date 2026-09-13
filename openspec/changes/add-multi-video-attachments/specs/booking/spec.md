## MODIFIED Requirements

### Requirement: Video attachment for video-analysis bookings
A booking for the `video_analysis` service SHALL require attaching an ordered set of at least one of the player's own videos in `ready` status, within the per-session caps on clip count and total duration, each with an optional note. Bookings for other services SHALL NOT carry videos. A set containing a video that is not owned by the player or not `ready`, a duplicate, or exceeding a cap SHALL be rejected and no session created.

#### Scenario: Clips attached at booking
- **WHEN** an amateur books video analysis and selects two `ready` videos from their library with notes
- **THEN** the session is created with those clips attached in the chosen order

#### Scenario: Video-analysis booking without a video
- **WHEN** an amateur submits a video-analysis booking with an empty set
- **THEN** the booking is rejected with a validation error

#### Scenario: Foreign or unready video rejected
- **WHEN** any submitted video id belongs to another user or is not `ready`
- **THEN** the booking is rejected and no session is created

#### Scenario: Set over the caps rejected
- **WHEN** the submitted set exceeds the clip count or total duration cap
- **THEN** the booking is rejected with the cap named and no session is created

### Requirement: Localized booking flow
The booking flow — service selection, week slot picker, clip attachment step with the caps meter, order summary with escrow notice, and payment-deadline countdown — SHALL render from the message catalogs in all five locales with no hard-coded strings, and SHALL display slot times in the viewer's timezone with an explicit "(your time)" label. The clip attachment step SHALL appear only for video-analysis bookings, SHALL let the player select several ready videos, order them and add notes, SHALL show the caps and current usage, and SHALL link to the upload flow when the player's library has no ready videos.

#### Scenario: Localized checkout
- **WHEN** a player opens the checkout page in any supported locale
- **THEN** the order summary, escrow notice, and countdown render from that locale's catalog

#### Scenario: Empty library during video-analysis booking
- **WHEN** a player with no ready videos starts a video-analysis booking
- **THEN** the attachment step offers a link to the video upload flow

#### Scenario: Selecting and ordering clips
- **WHEN** a player selects three ready videos and moves the third one to the top
- **THEN** the order summary lists the clips in the new order with their notes and the meter reflects three clips
