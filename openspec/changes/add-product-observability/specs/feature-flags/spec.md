## ADDED Requirements

### Requirement: Server-evaluated flags bootstrapped to the client
The web app SHALL evaluate feature flags on the server for the current user (or anonymous id) during rendering and SHALL bootstrap the result into the client, so flagged UI renders without flicker and without a per-component request; the client SHALL refresh flags in the background. Without a configured token every flag SHALL evaluate to its code default.

#### Scenario: Flag toggled without redeploy
- **WHEN** an operator turns a flag off in the vendor console
- **THEN** the next page render for affected users reflects the change without a new deployment

#### Scenario: No token
- **WHEN** the token is not configured
- **THEN** all flags return their code defaults and no request is made

### Requirement: API flag evaluation
The API SHALL evaluate flags for a user id through the `FeatureFlags` interface with local evaluation and periodic refresh, so a request-path check does not call the vendor synchronously.

#### Scenario: Kill switch in the API
- **WHEN** a kill-switch flag is off for everyone
- **THEN** the guarded API behaviour is disabled on the next refresh interval without a restart

### Requirement: Flag naming and lifetime
A flag SHALL be named after the OpenSpec change it guards and SHALL be removed from code when that change is archived; only flags explicitly documented as kill switches may outlive their change.

#### Scenario: Archived change leaves no flag
- **WHEN** a change guarded by a flag is archived
- **THEN** the code no longer references that flag name
