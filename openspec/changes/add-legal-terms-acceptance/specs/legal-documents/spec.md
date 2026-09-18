## ADDED Requirements

### Requirement: Document registry
The platform SHALL keep a single registry of its legal documents — terms of service (including the content and community guidelines), privacy policy (including the cookie section), imprint, booking and cancellation policy, and coach agreement — each with its versions (identifier, effective date, whether the change is material), a draft marker and an authoritative locale. The registry SHALL be the same source for the web and the API, and adding a version SHALL require no database change.

#### Scenario: Current version resolved
- **WHEN** any surface needs the current terms version
- **THEN** it reads the registry's latest version of the terms

### Requirement: Versioned localized legal pages
Every registered document SHALL be readable at `/legal/<document>` (current version) and `/legal/<document>/<version>` (any registered version) in all five locales, showing the version, its effective date, the draft marker while the text is a placeholder, and — outside the authoritative locale — a note that the translation is for convenience. Numbers such as the platform fee, the cancellation tiers, the auto-confirm window and the video retention period SHALL come from the platform's configuration through a public facts endpoint, never from the text. A registered version missing a locale file SHALL fail the web test suite.

#### Scenario: Old version stays readable
- **WHEN** a user opens the URL of the terms version they accepted after a newer version was published
- **THEN** the page shows that older text with its version and effective date

#### Scenario: Numbers follow configuration
- **WHEN** the platform fee configuration changes
- **THEN** the coach agreement page shows the new percentage without a text change

#### Scenario: Missing translation fails CI
- **WHEN** a version is registered without one of the five locale files
- **THEN** the web test suite fails naming the document, version and locale

### Requirement: Acceptance records
Every acceptance or acknowledgment SHALL be recorded as an append-only row with the user, document, version, locale of the request, context (registration, Google sign-up completion, verification submission, checkout, re-acceptance), the session for a checkout acknowledgment, and the time. Product code SHALL never update or delete such rows.

#### Scenario: Evidence of what was accepted
- **WHEN** an admin looks up a user who registered in German last month
- **THEN** the terms and privacy rows show the versions accepted, the `de` locale, the registration context and the time

### Requirement: Re-acceptance after a material change
When a registered version flagged material is newer than a user's latest accepted version of a document that applies to them (terms for everyone, the coach agreement for a professional who submitted for verification) — or when the user has never accepted it — the user's acceptance SHALL be stale. For a signed-in user with a stale acceptance the web SHALL show a blocking interstitial listing the documents, with links to read them and one action to accept the current versions; the interstitial SHALL NOT appear on legal pages or in a session room. The API SHALL refuse booking, paying, submitting for verification and changing availability with the stable error code `legal_reacceptance_required` naming the documents, and SHALL never refuse reading, joining a paid session, confirming, disputing, reviewing or cancelling. A newer version that is not material SHALL only produce a dismissible banner. A newer version SHALL be announced once per user and version by email.

#### Scenario: Material update blocks booking
- **WHEN** the terms are republished as material and a player who accepted the old version tries to book
- **THEN** the request is refused with `legal_reacceptance_required` and the interstitial shows on their next page load

#### Scenario: Room stays open
- **WHEN** that player opens the room of a session they already paid for
- **THEN** the room works and no interstitial is shown

#### Scenario: Accepting clears the gate
- **WHEN** the player accepts the current versions from the interstitial
- **THEN** rows with the re-acceptance context are recorded and booking works again

#### Scenario: Minor update only informs
- **WHEN** a version that is not material is published
- **THEN** signed-in users see a dismissible banner and nothing is refused

### Requirement: Site and email footers
Every page SHALL carry a footer linking the terms, privacy policy, imprint, booking policy, coach agreement, cookie settings and support; in the session room it SHALL be compact. Every transactional email SHALL end with the operator's name and links to the imprint and the privacy policy.

#### Scenario: Footer on checkout
- **WHEN** a player opens the checkout page in any locale
- **THEN** the footer with all legal links is present in that locale

#### Scenario: Email footer
- **WHEN** any transactional email is rendered
- **THEN** it ends with the operator name and the imprint and privacy links
