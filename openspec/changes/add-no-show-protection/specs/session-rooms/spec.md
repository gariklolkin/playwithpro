## MODIFIED Requirements

### Requirement: Attendance logging
The system SHALL record an attendance entry (user, session, join time) each time a party performs the join action during the join window, and SHALL enrich it with connection evidence reported by the video provider: the time the participant actually connected to the room and the time they left. Provider reports SHALL be accepted only when their authenticity is verified (signed by the provider with the platform's provider credentials); reports for unknown rooms or participants SHALL be ignored without error. Processing SHALL be idempotent so that repeated delivery of the same report does not alter the record. A connection report with no matching open entry SHALL create an entry carrying both join and connection times. Attendance entries SHALL be retained per session as evidence for attendance classification, confirmation and dispute handling, repeated joins SHALL each be recorded, and the dispute view SHALL present join, connection, and leave times. Attendance SHALL affect the session status only through attendance classification; recording an entry or a provider report SHALL NOT by itself change the session status.

#### Scenario: Join is logged
- **WHEN** a party performs the join action during the join window
- **THEN** an attendance entry with their identity and join time is recorded for the session

#### Scenario: Connection and leave stamped from provider reports
- **WHEN** the provider reports that the participant connected and later left the room
- **THEN** the party's open attendance entry gains the connection time and then the leave time

#### Scenario: Duplicate report is harmless
- **WHEN** the provider delivers the same connection report twice
- **THEN** the attendance record is unchanged by the second delivery

#### Scenario: Unsigned report rejected
- **WHEN** a request reaches the provider report endpoint without a valid provider signature
- **THEN** it is rejected as unauthorized and no attendance data changes

#### Scenario: Rejoin logged separately
- **WHEN** a party leaves and re-enters the room
- **THEN** a second attendance entry is recorded

#### Scenario: No-show leaves no entries
- **WHEN** neither party ever enters the room of a session
- **THEN** the session has no attendance entries while its status still progresses on schedule to `awaiting_confirmation`

## ADDED Requirements

### Requirement: Attendance classification for online sessions
For online services (`video_analysis`, `consultation`) the system SHALL classify each `awaiting_confirmation` session exactly once after the join window has closed (`endsAt` plus the configured after-window, plus a configurable buffer for late provider reports, default 5 minutes), and SHALL store the outcome and the classification time on the session. A party is *connected* when it has at least one attendance entry whose connection time lies inside the join window. The outcome SHALL be:

- `HELD` — both parties connected;
- `PLAYER_NO_SHOW` — the coach connected and the player did not;
- `COACH_NO_SHOW` — the player connected and the coach has no attendance entry at all;
- `NO_ATTENDANCE` — neither party has any attendance entry;
- `EVIDENCE_GAP` — every other case (the coach has a join entry without a connection time while the player connected, or neither party connected but at least one join entry exists).

`HELD` and `PLAYER_NO_SHOW` SHALL leave the session in the normal confirmation flow. `COACH_NO_SHOW`, `NO_ATTENDANCE` and `EVIDENCE_GAP` SHALL open a system dispute of the matching kind (see the disputes capability). Classification SHALL be enforced by the periodic sweep and SHALL be skipped for sessions that are no longer `awaiting_confirmation` (already confirmed or disputed by the player). A stored classification SHALL NOT be changed or re-run by later or duplicate provider reports. In-person `game` sessions SHALL NOT be classified.

The system SHALL additionally flag *partial attendance* when the coach's first connection is more than 10 minutes after `startsAt`, or when the time both parties were connected simultaneously is less than half of the scheduled duration. The flag SHALL be informational: it SHALL NOT change the outcome or block auto-confirm.

#### Scenario: Both connected
- **WHEN** the join window closes on a session where both parties have a connection time inside the window
- **THEN** the session is classified `HELD` and stays `awaiting_confirmation`

#### Scenario: Coach never joined
- **WHEN** the join window closes on a session where the player connected and the coach has no attendance entry
- **THEN** the session is classified `COACH_NO_SHOW` and a system dispute of that kind is opened

#### Scenario: Player never joined
- **WHEN** the join window closes on a session where the coach connected and the player did not
- **THEN** the session is classified `PLAYER_NO_SHOW`, stays `awaiting_confirmation`, and is paid out at auto-confirm

#### Scenario: Nobody came
- **WHEN** the join window closes on a session with no attendance entries
- **THEN** the session is classified `NO_ATTENDANCE` and a system dispute of that kind is opened

#### Scenario: Coach joined but no connection was reported
- **WHEN** the join window closes on a session where the player connected and the coach has a join entry without a connection time
- **THEN** the session is classified `EVIDENCE_GAP` and a system dispute of that kind is opened

#### Scenario: Connection outside the window does not count
- **WHEN** a party's only connection time lies after the join window closed
- **THEN** that party is treated as not connected

#### Scenario: Rejoins are merged
- **WHEN** a party has several attendance entries with connection times inside the window
- **THEN** the party counts as connected once, its first connection is the earliest one, and the overlap is computed over all its connected intervals

#### Scenario: Late report after classification
- **WHEN** a provider report for a classified session arrives after the classification
- **THEN** the attendance entry is updated as evidence and the stored outcome and any dispute are unchanged

#### Scenario: Already confirmed session
- **WHEN** the player confirmed the session before the join window closed
- **THEN** the session is not classified and no dispute is opened

#### Scenario: Late coach flagged
- **WHEN** both parties connected and the coach's first connection is 18 minutes after `startsAt`
- **THEN** the outcome is `HELD` with the partial-attendance flag set and auto-confirm still applies

### Requirement: Attendance summary for the parties
Session reads for the two parties SHALL include an attendance summary for online sessions: each party's first connection time (or none), the minutes both parties were connected simultaneously, the partial-attendance flag, and the classification outcome once stored. Before classification the summary SHALL be computed from the current entries with no outcome. The summary SHALL NOT expose raw attendance entries, and sessions of in-person services SHALL carry no summary.

#### Scenario: Player sees that the coach never joined
- **WHEN** the player fetches a session classified `COACH_NO_SHOW`
- **THEN** the response carries the player's first connection time, no coach connection time, zero overlap, and the outcome

#### Scenario: No raw rows
- **WHEN** a party fetches a session with several rejoins
- **THEN** the response contains only the summary fields and no list of attendance entries

### Requirement: Waiting note in the room
While a party is in the room of an `in_progress` session, more than 10 minutes have passed since `startsAt`, and the counterpart has not connected, the room SHALL show an informational note: the player is told the coach has not joined and that they will not be charged if the coach does not come; the coach is told the player has not joined and that the session still counts if they stay. The note SHALL offer no action, SHALL disappear once the counterpart connects, SHALL render from the message catalogs in all five locales, and the room SHALL stay open.

#### Scenario: Player waits for the coach
- **WHEN** the player is alone in the room 10 minutes after `startsAt`
- **THEN** the note that the coach has not joined yet and the player will not be charged is shown

#### Scenario: Counterpart arrives
- **WHEN** the counterpart connects while the note is visible
- **THEN** the note disappears
