## Why

A player pays for a consultation or a video analysis and keeps only what they remember of it. A recording they can rewatch is the most requested "output" of an online coaching session, it raises the perceived value of the paid hour, and it is a natural paid add-on. Recording voice and image is legally sensitive in the platform's core markets (Germany and France treat non-consensual recording as a criminal matter; GDPR applies everywhere), so consent, retention, and access have to be designed in from the start rather than bolted on.

## What Changes

- **Recording as a paid add-on, chosen at booking.** For online services only (`consultation`, `video_analysis`), a player can add "record this session" while booking, priced as a configurable percentage of the service price. The add-on is snapshotted into the session price and held in escrow with it; it belongs to the platform, so the coach's payout is unchanged. **If no recording is delivered** (coach withdrew, capacity unavailable, recording failed, or nobody confirmed in the room) the add-on is refunded to the player at settlement.
- **Two-sided, per-session consent.** A coach opts in to recording in their profile (default off); the add-on is only offered for coaches who did. Both parties confirm again on the pre-join panel of a session that has the add-on, with a versioned consent text; a session is recorded only when both confirmations exist. Either party can withdraw before the session starts, and either party can stop an ongoing recording (it is not resumed). Every consent, withdrawal, and stop is stored with who, when, and the consent text version as evidence.
- **Recording pipeline through the `VideoProvider` abstraction.** The API starts a recording once both parties are connected and consented, and stops it when the session's join window closes or on request. The LiveKit implementation uses the Egress service (self-hosted beside the media server, backed by Redis) writing directly to the platform's object storage; provider webhooks move the recording through `requested → recording → processing → ready | failed | cancelled`. A configurable concurrency cap (default 1 on the single-node deployment) cancels recordings that cannot be served instead of degrading the call.
- **Phase 1 — consultation:** room composite recording (both cameras, mixed audio) as an MP4.
- **Phase 2 — video analysis:** no pixels are recorded. Mixed audio of the call is captured (audio-only egress, no headless browser) and the session's playback timeline (play/pause/seek of the attached video) is persisted beside the annotations from `add-annotation-review`. The review page gains a replay mode: the audio drives a clock, the attached video follows the recorded timeline, and strokes appear when they were drawn. This is cheaper by an order of magnitude and yields a replay with moment navigation instead of a flat screen capture.
- **In-room experience.** Pre-join consent step, a persistent REC indicator for both parties while recording, a stop control, and status notices (waiting for the other party's consent, recording unavailable due to capacity, recording stopped).
- **Playback, ownership, retention.** Both parties can watch a ready recording from the session (pre-signed, short-lived URL). The player owns it and can delete it early. Recordings expire after a configurable retention period (default 90 days) and are removed by a sweep. Admins never receive a playback URL except while the session's dispute is open, and that access is logged; the admin dispute view otherwise shows recording metadata only (status, duration, consents).
- **Legal texts.** Consent copy (versioned), terms and privacy policy additions covering purpose, retention, admin access during disputes, and deletion, in all five locales.

## Capabilities

### New Capabilities

- `session-recording`: add-on pricing and settlement rule, two-sided consent and its evidence, recording lifecycle through the video provider, in-room indicators and controls, playback access and ownership, retention and deletion, admin access limits, and the video-analysis replay (audio + timeline + annotations).

### Modified Capabilities

- `booking`: "Booking creation with atomic slot claim" — the snapshot gains the optional recording add-on amount; the add-on is accepted only for online services of coaches who allow recording.
- `pro-profiles`: coach recording opt-in (new requirement, default off, shown on the public coach page).
- `payments`: "PaymentProvider abstraction with escrow semantics" — `release` accepts an optional partial refund amount so settlement can return an undelivered add-on to the player while paying the coach.
- `production-deploy`: new requirement — recording services (Redis + Egress) deployed beside the media server with a concurrency cap and storage credentials scoped to the recordings prefix.
- `dev-environment`: new requirement — Redis + Egress in the local compose so recording is testable end-to-end against MinIO.

## Impact

- **Database:** `ProProfile.recordingAllowed`; `Session.recordingAddonMinor`; new `SessionRecording` (status, provider egress id, object key, timing, size, expiry, deletion), `SessionRecordingConsent` (session, user, kind: booking | prejoin | withdrawal | stop, consent text version, timestamp), `SessionPlaybackEvent` (session, at, state) for the replay timeline; `RecordingAccessLog` for admin URLs.
- **API:** `VideoProvider` gains `startRecording`/`stopRecording` (+ LiveKit `EgressClient` implementation and `egress_*` webhook handling); new `recordings` module (consent, lifecycle, capacity, playback URL, retention sweep, admin access); `bookings.service.ts` add-on pricing; `settlement.service.ts` partial refund of an undelivered add-on; `PaymentProvider.release(ref, { refundMinor })`; `playback-sync.gateway.ts` write-through of playback state changes; `disputes.service.ts` recording metadata. New env: `RECORDING_ADDON_PERCENT`, `RECORDING_RETENTION_DAYS`, `RECORDING_MAX_CONCURRENT`, `RECORDING_CONSENT_VERSION`, `LIVEKIT_EGRESS_S3_*`.
- **Web:** booking panel add-on option, coach profile editor toggle and public coach page badge, pre-join consent step, REC indicator and stop control in `livekit-room.tsx`, session card "Recording" link and playback page, delete control, replay mode in `annotation-review.tsx`, admin dispute recording metadata and dispute-time playback. New `recording.*` catalog namespace plus consent, terms, and privacy texts in five locales.
- **Infra:** Redis (compose + k3s), `livekit/egress` (compose + k3s Deployment with 1 CPU / 1 Gi requests), LiveKit config `redis:` block, object-storage CORS unchanged, storage prefix `recordings/`. Node capacity on the single VPS allows one composite recording at a time; a second node is a follow-up if demand shows.
- **Dependencies:** `add-annotation-review` (persisted annotations and its review page) must be archived first — phase 2 builds on it.
- **Non-goals (explicit):** recording in-person game sessions, recording screen shares separately, transcripts/AI summaries, download of the recording file by the coach, sharing links outside the two parties, resuming a stopped recording, recording of admin verification calls.
