## ADDED Requirements

### Requirement: Call-time indicator and reminders
The session room response SHALL include the server's current time (`serverNow`), and the session room page SHALL derive all remaining-time computations from that value combined with the elapsed time since the response was received, never from the client clock alone. While the join window is open the page header SHALL show a live remaining-time indicator: the time until `startsAt` before the session starts, the time left until `endsAt` during the session, and the time elapsed past `endsAt` afterwards, updating at least once per second and formatted as minutes and seconds (hours when needed). While a party is connected to the call, the page SHALL show a non-blocking, dismissible, auto-dismissing reminder when the remaining time first drops to the reminder lead time (a shared constant of 10 minutes) and again when `endsAt` is reached; the end reminder SHALL name the time at which the room closes. Reminders SHALL be announced politely to assistive technology, SHALL NOT be repeated for a threshold that was already passed when the party connected, and SHALL NOT disconnect the call or otherwise interrupt it — session progression remains clock-driven as specified in "Time-driven session progression". When the attached clip card is fullscreen, reminders SHALL render inside the fullscreen element.

#### Scenario: Remaining time shown during the session
- **WHEN** a party opens the session room between `startsAt` and `endsAt`
- **THEN** the header shows the time left until `endsAt`, counting down every second

#### Scenario: Countdown uses server time
- **WHEN** a party's device clock is five minutes ahead of the server
- **THEN** the remaining time shown matches the server's view of the session, not the device clock

#### Scenario: Ten-minute reminder
- **WHEN** a party is connected to the call and the remaining time drops to ten minutes
- **THEN** a reminder toast appears, auto-dismisses, and the call continues uninterrupted

#### Scenario: End-of-session reminder
- **WHEN** a party is connected to the call and `endsAt` is reached
- **THEN** a reminder toast states that the session time is up and names the room's closing time, the header switches to the elapsed-over-time form, and the call stays connected

#### Scenario: Late joiner is not spammed
- **WHEN** a party joins the call with fewer than ten minutes left
- **THEN** the ten-minute reminder is not shown, and the end reminder still appears at `endsAt`

#### Scenario: Reminder visible in fullscreen
- **WHEN** the end reminder fires while the clip card is fullscreen
- **THEN** the toast is visible over the fullscreen card

## MODIFIED Requirements

### Requirement: Localized session room
The session room page — countdown/closed states, pre-join panel, call controls and states, video panel, venue block for game sessions, the remaining-time indicator and the call-time reminders — SHALL render from next-intl catalogs in all five locales with no hard-coded strings, and SHALL show session times in the viewer's timezone.

#### Scenario: Localized room page
- **WHEN** a party opens the session room in any supported locale
- **THEN** all room UI strings, including pre-join and in-call controls, the remaining-time indicator and the reminder toasts, render from that locale's catalog
