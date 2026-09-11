## MODIFIED Requirements

### Requirement: Booking creation with atomic slot claim
The system SHALL let an authenticated amateur book a verified coach by selecting one of the coach's active services and one publicly listable open slot, optionally with the recording add-on for online services of coaches who allow recording. Creating the booking SHALL atomically claim the slot (open → booked) and create a session in `pending_payment` with a payment deadline (configurable, default 15 minutes). When the slot is no longer claimable — already booked, removed, or starting in less than 2 hours — the booking SHALL be rejected with a conflict and no session created. The session SHALL snapshot the service type, service price (minor units + currency), the recording add-on amount (zero when not chosen), platform fee (configurable percentage of the service price, default 10%, plus the whole add-on), and the slot's start/end times, so later price, add-on rate, or availability edits never affect existing bookings.

#### Scenario: Successful booking
- **WHEN** an amateur books an open slot for a coach's consultation service
- **THEN** the slot becomes booked and a session is created in `pending_payment` with snapshotted price, fee, and times, and a payment deadline 15 minutes ahead

#### Scenario: Booking with the recording add-on
- **WHEN** an amateur books an online service with the recording add-on
- **THEN** the session snapshots the add-on amount and the payable total includes it

#### Scenario: Concurrent booking of the same slot
- **WHEN** two amateurs submit bookings for the same open slot at the same time
- **THEN** exactly one booking succeeds and the other receives a conflict with no session created

#### Scenario: Slot too soon
- **WHEN** an amateur attempts to book a slot starting in less than 2 hours
- **THEN** the booking is rejected with a conflict

#### Scenario: Price edit does not affect existing booking
- **WHEN** a coach changes a service price after a session was booked
- **THEN** the existing session keeps its snapshotted price
