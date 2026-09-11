## ADDED Requirements

### Requirement: Device failure notice
While in a call, the session room SHALL show a device notice only while a camera or microphone the party enabled on pre-join is not published, naming the missing device, and SHALL remove the notice as soon as that device publishes. Device errors unrelated to the enabled camera or microphone (for example a cancelled screen-share picker) SHALL NOT produce the notice.

#### Scenario: Transient failure on join
- **WHEN** the camera briefly fails while the pre-join preview releases it and then publishes successfully
- **THEN** no notice remains visible once the camera track is published

#### Scenario: Cancelled screen share
- **WHEN** a party opens the screen-share picker and cancels it
- **THEN** no device notice is shown

#### Scenario: Camera genuinely unavailable
- **WHEN** the party enabled the camera on pre-join and it cannot be published
- **THEN** a notice states that the camera is unavailable while the microphone keeps working
