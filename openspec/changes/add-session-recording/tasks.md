## 1. Data model, config, shared contract

- [ ] 1.1 Prisma: `ProProfile.recordingAllowed`, `Session.recordingAddonMinor`, `Payment.refundedMinor`, models `SessionRecording` (+ status enum, cancel reason), `SessionRecordingConsent` (+ kind enum), `RecordingAccessLog`, `SessionPlaybackEvent`; migration `add_session_recording`
- [ ] 1.2 Env validation: `RECORDING_ADDON_PERCENT` (15), `RECORDING_RETENTION_DAYS` (90), `RECORDING_MAX_CONCURRENT` (1), `RECORDING_CONSENT_VERSION`, `LIVEKIT_EGRESS_S3_ENDPOINT|BUCKET|ACCESS_KEY|SECRET_KEY|REGION`
- [ ] 1.3 Shared types: `RecordingStatus`, `SessionRecordingResponse`, `SessionRoomResponse.recording`, `SessionResponse.recording` summary + `recordingAddonMinor`, `CreateBookingDto.recording`, `ProProfile.recordingAllowed` on editor/public DTOs, admin dispute recording metadata

## 2. Payments and booking

- [ ] 2.1 `PaymentProvider.release(ref, { refundMinor? })`; mock logs the partial refund; `Payment.refundedMinor` written by `SettlementService`
- [ ] 2.2 `SettlementService`: pass `recordingAddonMinor` as `refundMinor` unless the recording is `READY`; wait for a terminal recording status or the stale timeout before releasing; unit + `settlement.e2e-spec.ts` cases (delivered, cancelled, failed, no add-on)
- [ ] 2.3 `BookingsService.create`: validate the add-on (online service, coach allows), compute and snapshot `recordingAddonMinor`, fold it into `priceMinor`/`platformFeeMinor`, create `SessionRecording{REQUESTED}` + `BOOKING` consent row; pre-start cancel refunds the total (unchanged) and cancels the recording; unit + `booking.e2e-spec.ts`
- [ ] 2.4 Coach opt-in: profile editor field, public coach page badge, catalog DTO; default off

## 3. Recording pipeline (API)

- [ ] 3.1 `VideoProvider.startRecording/stopRecording`; `LiveKitVideoProvider` via `EgressClient` (room composite; `audioOnly` for `audio` mode; S3 output from `LIVEKIT_EGRESS_S3_*`); unit spec with the SDK mocked
- [ ] 3.2 `recordings` module: `RecordingsService` (consent, withdraw, start-on-second-connect with conditional status update + capacity check in one transaction, stop, cancel with reason), `RecordingsController` (`GET /sessions/:id/recording`, `POST …/consent`, `POST …/withdraw`, `POST …/stop`, `GET …/playback-url`, `DELETE …`)
- [ ] 3.3 Webhook: handle `egress_started|egress_updated|egress_ended` idempotently → `RECORDING|FAILED|READY` with provider ref, timing, duration, size, object key, `expiresAt = readyAt + retention`
- [ ] 3.4 Hook `onParticipantConnected` after attendance stamping; sweep in `SessionProgressionService` (or `RecordingsSweepService`): stop recordings whose window closed, expire `READY` past `expiresAt` (delete object), fail stale `STARTING|PROCESSING`
- [ ] 3.5 `SessionRoomsService.getRoom`: `recording` block (status, requested, waitingFor, cancelReason); `session.mapper.ts`: recording summary + expiry
- [ ] 3.6 Admin: dispute metadata (status, consents, duration, expiry) and `GET /admin/disputes/:id/recording/playback-url` gated on `OPEN` + `RecordingAccessLog`
- [ ] 3.7 e2e (`session-rooms.e2e-spec.ts` or new `recordings.e2e-spec.ts`): both consents → start on second connect; decline → cancelled; capacity cap; stop; webhook lifecycle; parties get URLs, third party 404; player delete; admin gated on open dispute + log entry

## 4. Web — booking, room, playback

- [ ] 4.1 `booking-panel.tsx` / `checkout-panel.tsx`: add-on option with price and consent text (version shown), total updated; hidden for in-person and non-allowing coaches
- [ ] 4.2 `call-prejoin.tsx`: consent step when `recording.requested` (text, confirm/decline), posts consent before join; `livekit-room.tsx`: REC indicator, stop control, notices (waiting for counterpart, cancelled by capacity, stopped, failed); `session-room.tsx` polls the descriptor every 10 s while open
- [ ] 4.3 Session card and session view: recording status, expiry, withdraw-before-start, watch link; recording page `app/[locale]/sessions/[id]/recording/page.tsx` with player and player-only delete
- [ ] 4.4 Admin disputes: recording metadata block and dispute-time playback button
- [ ] 4.5 i18n: `recording.*` namespace, consent text (versioned key), terms and privacy additions in all five catalogs
- [ ] 4.6 Unit tests: add-on total math in the booking panel; pre-join consent gating; REC indicator states

## 5. Infra

- [ ] 5.1 Compose: `redis`, `livekit/egress` (config: redis, `ws://livekit:7880`, keys, S3 → MinIO); `infra/livekit/livekit.yaml` gets `redis:`; MinIO bootstrap creates nothing new (same bucket, `recordings/` prefix)
- [ ] 5.2 k3s: `infra/k8s/redis/` Deployment + Service; `infra/k8s/livekit/egress.yaml` Deployment (1 CPU / 1 Gi requests, 2 Gi limit) + `egress.yaml.tpl` config rendered by `apply-secrets.sh`; `livekit.yaml.tpl` `redis:` block; API env additions; README/runbook (deploy order, LiveKit restart window, retirement)
- [ ] 5.3 Staging: deploy, run one consultation recording end to end, check node headroom during the recording (resource audit from change 14), confirm the file under `recordings/` and playback

## 6. Phase 2 — video-analysis replay (after 1–5 verified)

- [ ] 6.1 `PlaybackSyncGateway`: write-through of playback state changes to `SessionPlaybackEvent` while the session's recording is `RECORDING` (flag refreshed from status; heartbeats excluded); unit + e2e
- [ ] 6.2 `RecordingsService`: `audio` mode for `video_analysis` sessions; `GET /sessions/:id/recording/replay` → playback-url + `startedAt` + timeline events (parties only)
- [ ] 6.3 `annotation-review.tsx` replay mode: audio element as clock, attached video follows the timeline (seek-on-drift 0.3 s, muted), strokes appear by `createdAtMs`, moment chips seek to the first on-screen time; degrade to audio + annotations without the video
- [ ] 6.4 Unit tests for the timeline → position derivation and drift correction; two-browser verification of a recorded video-analysis session and its replay

## 7. Verification and wrap-up

- [ ] 7.1 lint/tsc/unit/e2e green; consent, terms, and privacy texts reviewed by the owner; add-on rate confirmed
- [ ] 7.2 Update `openspec/project.md` roadmap (change 17) + memory
