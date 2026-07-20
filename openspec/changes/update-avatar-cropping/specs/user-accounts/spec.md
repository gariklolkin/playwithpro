# user-accounts Delta Spec

## MODIFIED Requirements

### Requirement: Account avatar
The system SHALL let any authenticated user (amateur or professional) set a profile avatar, and SHALL let them replace or remove it. The UI SHALL accept an image of any size in any format the browser can decode and SHALL open a crop dialog (square frame with zoom and pan); the cropped area is exported client-side to a normalized square image (512×512, WebP with JPEG fallback), which strips metadata and bakes in EXIF orientation. The normalized image SHALL be uploaded via the existing two-step flow: request a pre-signed URL (JPEG/PNG/WebP, maximum 5 MB — the server contract), upload directly to S3-compatible storage, then confirm to attach the object to the account. Server-side validation SHALL remain unchanged as defense in depth.

#### Scenario: Large desktop photo is cropped and uploaded
- **WHEN** a user picks a 30 MB 6000×4000 photo, adjusts the crop, and confirms
- **THEN** a 512×512 normalized image is uploaded and attached — the original size never hits the server limit

#### Scenario: Crop dialog controls framing
- **WHEN** the user zooms and pans inside the crop dialog before confirming
- **THEN** the uploaded avatar contains exactly the selected square area

#### Scenario: Undecodable file
- **WHEN** the user picks a file the browser cannot decode as an image
- **THEN** an inline error is shown and no upload starts

#### Scenario: Cancel keeps the current avatar
- **WHEN** the user closes the crop dialog without confirming
- **THEN** no request is made and the existing avatar (or initials fallback) stays

#### Scenario: Disallowed content type at the API
- **WHEN** a client bypasses the UI and requests an upload URL for a `video/mp4` file
- **THEN** the request is rejected with a validation error and no URL is issued

#### Scenario: Remove avatar
- **WHEN** a user removes their avatar
- **THEN** subsequent reads return no avatar and the UI falls back to initials
