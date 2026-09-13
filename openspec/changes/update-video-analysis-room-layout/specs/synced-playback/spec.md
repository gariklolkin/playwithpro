## MODIFIED Requirements

### Requirement: Playback speed control
The attached-video player bar in video-analysis rooms SHALL offer a playback-speed menu with presets of 0.25×, 0.5×, 0.75×, 1×, 1.5×, and 2×, and SHALL show the active rate on the menu's trigger; a shared rate that is not a preset (published by an older client) SHALL be displayed as its value with no preset marked. The server SHALL accept rates within the browser-supported range only and SHALL treat a snapshot without a rate as 1×.

#### Scenario: Preset sets the rate
- **WHEN** a party picks 0.5× in the speed menu
- **THEN** their video plays at 0.5×, the menu trigger shows 0.5×, and the peer follows at 0.5×

#### Scenario: Non-preset rate shown
- **WHEN** the shared state carries a rate of 1.75×
- **THEN** the menu trigger shows 1.75× and no preset is marked

#### Scenario: Out-of-range rate dropped
- **WHEN** a client publishes a snapshot with a rate of 50
- **THEN** the server ignores the snapshot
