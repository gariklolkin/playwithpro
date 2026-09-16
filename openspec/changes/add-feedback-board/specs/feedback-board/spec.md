## ADDED Requirements

### Requirement: Public idea board
The platform SHALL offer a feature-request board at `https://feedback.play-with.pro`, run as a self-hosted Fider instance at a pinned version, where signed-in board users can post ideas, vote, comment and receive status notifications by email. Until launch the board SHALL be private (invite-only): uninvited visitors SHALL NOT see posts or be able to sign up. Sign-in SHALL be by email code only. The board SHALL be a single English board with "Coach" and "Player" tags and area tags (booking, payments, room, video analysis, profile), using Fider's default statuses, with a welcome text that directs problems with a session, payment or account to the in-app support channel.

#### Scenario: Uninvited visitor
- **WHEN** a visitor who was not invited opens the board
- **THEN** they can neither read posts nor sign up

#### Scenario: Invited coach signs in
- **WHEN** an invited coach requests a sign-in code
- **THEN** the code arrives by email from the platform's domain and signs them in

#### Scenario: Post, vote, comment, notify
- **WHEN** an invited user posts an idea, another votes on it, and an admin sets its status to planned
- **THEN** the idea shows the vote count and everyone who voted is emailed about the status change

### Requirement: Board entry points in the app
The web app SHALL link to the board from the navbar user menu ("Suggest an idea") and from a card on the professional dashboard ("Help shape the platform"), each opening the board in a new tab with `utm_source=app` and a `utm_content` value naming the placement. Labels SHALL come from the message catalogs in all five locales. The board URL SHALL be configured at build time; when it is not configured, no link SHALL be rendered. The session room and error screens SHALL NOT link to the board.

#### Scenario: Links rendered with a configured URL
- **WHEN** the web app is built with the board URL and a coach opens the dashboard in any locale
- **THEN** the user menu and the dashboard card link to the board in a new tab with the placement in `utm_content`, labelled in that locale

#### Scenario: No URL, no links
- **WHEN** the web app is built without the board URL
- **THEN** neither the menu item nor the dashboard card is rendered

#### Scenario: Player sees only the menu link
- **WHEN** an amateur signs in
- **THEN** the user menu offers "Suggest an idea" and no dashboard card is shown
