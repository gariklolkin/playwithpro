## ADDED Requirements

### Requirement: Localized in-app support panel
The web app SHALL provide an in-app support panel rendered with the platform's own UI and next-intl strings in all five locales, through which signed-in users and anonymous visitors can start a conversation with the operator and read replies. The panel SHALL poll for replies only while open, and SHALL be reachable from the user menu, the error screens (with the error attached), the failed-payment state, the session room's connection-failure state, and the dispute form. Without a configured token the panel and its entry points SHALL be hidden.

#### Scenario: Support round trip
- **WHEN** a signed-in user writes a message in the panel and the operator replies in the vendor inbox
- **THEN** the reply appears in the panel while it is open, and the ticket shows the user's identity, recent events and replay when consent was given

#### Scenario: Anonymous visitor
- **WHEN** a visitor who is not signed in opens the panel
- **THEN** they can send a message after providing an email address

### Requirement: Verified identity for signed-in users
For signed-in users the panel SHALL identify the user to the vendor with a server-computed HMAC over the user id, using a secret that exists only on the API, so tickets follow the user across devices and cannot be spoofed from the browser.

#### Scenario: Ticket follows the user
- **WHEN** a user writes from one device and opens the panel on another
- **THEN** the same conversation is shown

### Requirement: Support email channel
Mail sent to `support@play-with.pro` SHALL arrive as a ticket in the same inbox, and operator replies SHALL be sent from the platform's domain passing SPF, DKIM and DMARC. The DNS and vendor steps SHALL be documented for the operator.

#### Scenario: Email round trip
- **WHEN** a user emails `support@play-with.pro` and the operator replies from the inbox
- **THEN** the mail becomes a ticket and the reply is delivered from the platform domain without spam or authentication failures
