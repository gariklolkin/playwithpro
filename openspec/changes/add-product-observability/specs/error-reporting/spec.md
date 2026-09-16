## ADDED Requirements

### Requirement: Web exception reporting
The web app SHALL report uncaught client exceptions, errors caught by the route and global error boundaries, and server-side request errors to the error reporter, each tagged with `environment`, `release` and the current locale, and the error screens SHALL offer the support channel with the error attached.

#### Scenario: Client error reported
- **WHEN** a consenting user hits a rendering error in the session room
- **THEN** the error appears in error tracking with a readable stack trace and the correct release, and the error screen offers to contact support

#### Scenario: Server-side error reported
- **WHEN** a server component throws during a request
- **THEN** the error is reported from the server process regardless of client consent, with no user identity attached

### Requirement: API exception reporting
The API SHALL report unexpected exceptions and 5xx responses through a global exception filter, SHALL NOT report expected 4xx responses, and SHALL attach the request route, method, status and the acting user id (no body, no headers).

#### Scenario: Unexpected exception
- **WHEN** a request handler throws a non-HTTP exception
- **THEN** a 500 is returned and the exception is reported with route and user id

#### Scenario: Expected client error not reported
- **WHEN** a request fails validation with a 400
- **THEN** nothing is reported

### Requirement: Readable stack traces
Production image builds SHALL upload source maps for the web bundles and the API build tagged with the image's release, so reported stack traces resolve to source lines.

#### Scenario: Stack trace resolves
- **WHEN** an error is reported from a deployed release
- **THEN** its frames show the original file and line

### Requirement: Deduplication and rate limiting
Each reporter SHALL suppress repeats of the same error fingerprint within a short window and SHALL cap reports per minute per process, so a reconnect loop or a crashing render cannot exhaust the monthly allowance.

#### Scenario: Reconnect loop
- **WHEN** the same connection error is thrown many times per second
- **THEN** it is reported once per window with a count, not once per occurrence
