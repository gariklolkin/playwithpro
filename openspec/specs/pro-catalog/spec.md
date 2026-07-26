# pro-catalog Specification

## Purpose
Public coach discovery: a paginated catalog of verified coaches with multi-select language/service filters and a price cap bound to the matched service, plus the public coach profile view the booking flow starts from — both surfacing the aggregate rating, with the coach page listing reviews.

## Requirements

### Requirement: Public coach catalog
The system SHALL expose a public, paginated catalog of coaches whose profiles are verified, filterable by spoken languages, offered service types, and maximum hourly price. The language and service filters SHALL accept multiple selections with any-of semantics: a coach matches when they speak at least one selected language and offer at least one active service of a selected type; when a price cap is also given, one and the same service MUST satisfy both the type and the price condition. Each catalog entry SHALL include the coach's display name, avatar, languages, active services with prices (venue label for the in-person game service), the lowest active service price ("price-from"), the coach's aggregate rating (average with one decimal + review count, or a "no reviews yet" presentation), and the start time of their next publicly listable open slot (absent when none). Unverified profiles SHALL never appear.

#### Scenario: Browsing verified coaches
- **WHEN** an anonymous visitor opens the catalog
- **THEN** they see cards for verified coaches only, each with name, avatar, languages, services with prices, price-from, rating aggregate, and next free slot when one exists

#### Scenario: Filtering by multiple languages and services
- **WHEN** a visitor selects languages "de" and "fr" and services "video_analysis" and "consultation"
- **THEN** coaches speaking German or French with an active video-analysis or consultation service are returned

#### Scenario: Price cap binds to the matched service
- **WHEN** a visitor selects services "video_analysis" and "game" with a maximum price, and a coach's only service within the cap is a consultation
- **THEN** that coach is not returned

#### Scenario: Filtering by maximum price
- **WHEN** a visitor sets a maximum hourly price
- **THEN** only coaches with at least one active service at or below that price are returned

#### Scenario: Unverified coach excluded
- **WHEN** a coach's profile is in draft, pending review, or rejected status
- **THEN** the coach does not appear in the catalog

#### Scenario: Rating on the catalog card
- **WHEN** a visitor sees a coach with 12 reviews averaging 4.7
- **THEN** the card shows 4.7 and the review count

### Requirement: Public coach profile
The system SHALL expose a public profile view for a verified coach: display name, avatar, bio, languages, active services with per-service prices (including the venue label and map position for the in-person game service), the aggregate rating (average + review count, or "no reviews yet"), and a reviews section listing the coach's reviews per the reviews capability. Requesting a non-verified or non-existent profile SHALL yield not-found.

#### Scenario: Viewing a verified coach
- **WHEN** a visitor opens a verified coach's public profile
- **THEN** they see the bio, languages, all active services with prices (the game service showing its venue), the rating aggregate, and the reviews section

#### Scenario: Unverified profile hidden
- **WHEN** a visitor requests the public profile of an unverified coach
- **THEN** the request yields not-found

### Requirement: Localized catalog pages
The catalog and public coach profile pages SHALL render in all five locales (en, fr, de, ru, zh) with no hard-coded strings, SHALL display prices with their currency, and SHALL render slot times in the viewer's timezone with an explicit "(your time)" label. The catalog grid SHALL collapse from two columns to one below 900px.

#### Scenario: Localized catalog
- **WHEN** a visitor opens the catalog under the `ru` locale
- **THEN** all UI copy renders from the Russian message catalog

#### Scenario: Viewer-timezone slot display
- **WHEN** a visitor in UTC+2 sees a coach whose next slot is 10:00 UTC
- **THEN** the slot is shown as 12:00 with a "(your time)" label
