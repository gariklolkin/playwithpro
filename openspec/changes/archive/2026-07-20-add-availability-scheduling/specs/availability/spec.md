# availability Spec Delta

## ADDED Requirements

### Requirement: Weekly availability template
A professional SHALL define recurring weekly availability as per-weekday time windows in their own timezone, with 30-minute granularity and a minimum window of 60 minutes. Windows on the same weekday MUST NOT overlap. Wall-clock times SHALL stay stable across DST transitions.

#### Scenario: Template accepted
- **WHEN** a coach saves "Mon 18:00–21:00, Wed 18:30–20:30"
- **THEN** the template is stored and concrete slots appear for the next 28 days

#### Scenario: Overlapping windows rejected
- **WHEN** a coach saves two Monday windows 18:00–20:00 and 19:00–21:00
- **THEN** the save is rejected with a validation error

#### Scenario: DST stability
- **WHEN** a DST transition occurs in the coach's timezone between two weeks
- **THEN** slots in both weeks start at the same local wall-clock time (different UTC instants)

### Requirement: Slot materialization
The system SHALL expand the weekly template into concrete 60-minute slots (UTC) on a rolling 28-day horizon, refreshed daily and immediately after template edits or a coach timezone change. Materialization SHALL be idempotent: a slot start that already exists for the coach — in any status — is never duplicated or resurrected.

#### Scenario: Window expansion
- **WHEN** a Monday window 18:00–21:00 is materialized
- **THEN** three slots are created: 18:00, 19:00, and 20:00 local time, stored as UTC

#### Scenario: Template edit reconciliation
- **WHEN** a coach changes Monday 18:00–21:00 to 19:00–22:00
- **THEN** future open rule-generated slots at 18:00 disappear, slots at 21:00 appear, and manual slots are untouched

### Requirement: Per-slot overrides
A coach SHALL be able to remove any open slot (the removal survives re-materialization) and to add one-off manual slots at future 30-minute-aligned times that do not overlap existing slots.

#### Scenario: Removed slot stays removed
- **WHEN** a coach removes next Tuesday's 18:00 slot and the daily materialization job later runs
- **THEN** the 18:00 slot does not reappear while other Tuesday slots remain open

#### Scenario: Manual slot outside the template
- **WHEN** a coach adds a one-off slot for Saturday 10:00 with no Saturday window in the template
- **THEN** the slot is created as open and survives template edits

### Requirement: Public open-slot listing
The system SHALL expose the open future slots of a verified coach, excluding slots starting less than 2 hours from now, as UTC timestamps for clients to render in the viewer's timezone. Profiles that are not verified SHALL NOT expose slots.

#### Scenario: Only bookable slots served
- **WHEN** a client requests a verified coach's slots and one slot starts in 90 minutes
- **THEN** that slot is excluded and all other open future slots are returned in UTC

#### Scenario: Unverified profile
- **WHEN** a client requests slots of a coach whose profile is not verified
- **THEN** the request yields not-found

### Requirement: Availability dashboard
A professional SHALL manage availability on a dedicated dashboard page: a weekly template editor with explicit save, and an upcoming-4-weeks view grouped by day in the coach's timezone (timezone labeled) with per-slot removal and manual slot creation. All copy SHALL come from the localized message catalogs.

#### Scenario: Coach-only access
- **WHEN** an amateur navigates to the availability page
- **THEN** they are redirected to the dashboard

#### Scenario: Timezone rendering
- **WHEN** a coach in UTC+10 views a slot stored as 08:00 UTC
- **THEN** the slot is shown at 18:00 under the correct local day with the timezone labeled
