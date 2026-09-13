## ADDED Requirements

### Requirement: Ordered clip set with notes
A `video_analysis` session SHALL carry an ordered set of one or more of the player's own `ready` videos ("clips"), each with an optional short note (at most 80 characters) written by the player. The set SHALL be stored independently of the session's price and duration and SHALL be exposed in the same order to both parties.

#### Scenario: Several clips with notes
- **WHEN** a player books video analysis and attaches a match recording and two drill clips with the notes "serve" and "forehand loop"
- **THEN** the session is created with the three clips in the chosen order and both parties see the notes next to the clip titles

#### Scenario: Duplicate clip rejected
- **WHEN** the submitted set lists the same video twice
- **THEN** the request is rejected with a validation error and nothing is stored

### Requirement: Per-session attachment caps
The system SHALL cap the number of clips and their total duration per session from platform configuration (`SESSION_VIDEO_MAX_COUNT`, default 5; `SESSION_VIDEO_MAX_TOTAL_MIN`, default 60). The caps SHALL NOT depend on the session's length, service price, or coach. The caps and the current usage SHALL be shown to the player wherever clips are chosen, and a set exceeding a cap SHALL be rejected with a message that states the cap and the current total.

#### Scenario: Meter while choosing clips
- **WHEN** a player has selected three clips totalling 41 minutes with caps of 5 clips and 60 minutes
- **THEN** the attachment step shows "3 of 5 clips" and "41:00 of 60:00" before submission

#### Scenario: Over the duration cap
- **WHEN** the selected clips total 65 minutes with a 60-minute cap
- **THEN** submission is disabled in the UI and, if submitted directly, the API rejects the set naming the 60-minute cap and the 65-minute total

#### Scenario: Over the count cap
- **WHEN** a player attempts to select a sixth clip with a cap of 5
- **THEN** the sixth clip cannot be selected and the meter explains the cap

### Requirement: Editing attachments until the session starts
The player SHALL be able to replace the session's clip set (add, remove, reorder, edit notes) while the session is `pending_payment` or `paid_escrow` and its start time has not passed, under the same validation and caps as at booking. The replacement SHALL be atomic. The coach and third parties SHALL NOT be able to edit the set. Editing SHALL NOT change the session's price or escrow.

#### Scenario: Player adds a clip after paying
- **WHEN** the player of a `paid_escrow` session that starts tomorrow adds a fourth clip within the caps
- **THEN** the set is replaced, the escrowed amount is unchanged, and the coach sees four clips

#### Scenario: Edit after start rejected
- **WHEN** the player submits a new set once the session's start time has passed
- **THEN** the request is rejected and the set is unchanged

#### Scenario: Coach cannot edit
- **WHEN** the coach submits a new set for their session
- **THEN** the request is denied

### Requirement: Clip removed from the library
When a player deletes a video from their library, it SHALL be removed from every session set it belongs to, keeping the remaining clips in order. A session left with no clips SHALL remain valid: its room and list entry SHALL show that the clips were removed, and the player SHALL be able to attach clips again until the session starts. Before deleting an attached video the library SHALL tell the owner how many upcoming sessions use it.

#### Scenario: Warned deletion
- **WHEN** the owner starts deleting a video attached to two upcoming sessions
- **THEN** the confirmation names the two sessions before the deletion proceeds

#### Scenario: Session without clips
- **WHEN** the only clip of a paid session has been deleted and the coach opens the room
- **THEN** the room shows the call with a notice that the clips were removed instead of the video panel

### Requirement: Visibility of the attachment set
Both parties SHALL see the session's clips (title, note, duration, order) in their session lists and in the room. The coach SHALL be able to open each clip of a paid session, and SHALL NOT see clips of unpaid or cancelled sessions.

#### Scenario: Coach lists the clips of a paid session
- **WHEN** the coach views a `paid_escrow` session with three clips
- **THEN** the list entry shows all three with their notes, each opening that clip

#### Scenario: Unpaid session hides clips
- **WHEN** the coach views a `pending_payment` session
- **THEN** the clips are listed by title only and are not openable

### Requirement: Localized attachment UI
The attachment step, the session clip editor, the caps meter and its messages, the room clip tabs, and the removed-clips notice SHALL render from the message catalogs in all five locales, with durations formatted per locale.

#### Scenario: Localized meter
- **WHEN** a player chooses clips in any supported locale
- **THEN** the meter, cap messages and note placeholders render from that locale's catalog
