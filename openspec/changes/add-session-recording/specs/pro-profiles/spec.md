## ADDED Requirements

### Requirement: Coach recording opt-in
A coach SHALL be able to allow or disallow recording of their online sessions on their profile; the default SHALL be disallowed. The public coach page SHALL show whether recording is available, and the booking flow SHALL offer the recording add-on only when it is allowed. Changing the setting SHALL NOT affect sessions already booked.

#### Scenario: Default is off
- **WHEN** a coach profile is created
- **THEN** recording is disallowed and the coach page shows no recording availability

#### Scenario: Coach enables recording
- **WHEN** the coach enables recording in the profile editor
- **THEN** the coach page shows recording as available and new bookings can include the add-on
