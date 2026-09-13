## Context

Calls run on a self-hosted LiveKit server (one process, host network on the single-node k3s VPS; compose in dev), reached through the `VideoProvider` port (`describeRoom`, `issueToken`) with webhooks stamping attendance. Money is a single escrow hold per session (`priceMinor`, `platformFeeMinor` snapshots; `SettlementService` is the only caller of `release`/`refund`; the mock provider has no partial operations). Video-analysis rooms have a party-only socket channel with persisted annotations (`add-annotation-review`) and a read-only review page. There is no Redis anywhere. Node budget is tight: api 300m/512Mi, web 200m/256Mi, livekit 250m/256Mi requests, Postgres, Traefik.

Legal constraints drive the shape: consent must be explicit, two-sided, per session, and evidenced; retention and admin access must be bounded and documented.

## Goals / Non-Goals

**Goals:**
- Consent-first recording that cannot start without both parties' per-session confirmation.
- A recording pipeline that never degrades the call: capacity problems cancel the recording, not the session.
- Fair money: the add-on is only kept when a recording is delivered.
- A video-analysis replay that is cheap to produce and better than a screen capture.

**Non-Goals:**
- Recording in-person sessions or admin verification calls; transcripts; coach download; sharing outside the parties; resuming a stopped recording; multi-node egress scaling.

## Decisions

1. **Add-on belongs to the platform; refund on non-delivery via partial release.** `Session.recordingAddonMinor` is snapshotted at booking; `priceMinor` = service price + add-on; `platformFeeMinor` = fee(service price) + add-on. Coach payout (`price − fee`) is unchanged by the add-on. `PaymentProvider.release(ref, { refundMinor? })` returns `refundMinor` to the payer in the same movement; `SettlementService` passes `recordingAddonMinor` when the recording is not `ready`, and `Payment` gains `refundedMinor` for the ledger. *Alternatives rejected:* charging the add-on only after delivery (second payment flow, second hold) and a separate `Payment` row for the add-on (two holds to reconcile in every existing flow).

2. **Consent as an append-only evidence table.** `SessionRecordingConsent { sessionId, userId, kind: BOOKING | PREJOIN | WITHDRAWAL | STOP, textVersion, createdAt }`. "Both consented" = each party has a `PREJOIN` row and no `WITHDRAWAL` row. `RECORDING_CONSENT_VERSION` (env) is stamped on every row so a later text change never retroactively covers old consents. Coach profile opt-in (`ProProfile.recordingAllowed`) is a *general* permission that gates the add-on offer; it is not consent and never substitutes for the pre-join confirmation.

3. **Start on the second connected consented party; the API decides, not the client.** The LiveKit `participant_joined` webhook already reaches `AttendanceEvidenceService`; `RecordingsService.onParticipantConnected(sessionId)` runs after it and, when both attendance rows are connected, both `PREJOIN` consents exist, the recording is `requested`, and the running count is below `RECORDING_MAX_CONCURRENT`, calls `VideoProvider.startRecording`. The start is guarded by a conditional `updateMany` (`status: REQUESTED → STARTING`) so duplicate webhooks cannot start two egresses. Capacity is checked inside the same transaction (`count(status in STARTING|RECORDING) < cap`). *Alternative rejected:* the client requesting the start after join — a client can be missing or lying; the server has all the facts.

4. **Stop conditions.** Explicit stop (`POST /sessions/:id/recording/stop`, either party, stores a `STOP` consent row), join-window close (`SessionProgressionService` sweep stops any `RECORDING` whose window has closed), and room emptying (LiveKit ends the egress itself when the room is empty for `empty_timeout`; the `egress_ended` webhook then finalizes). Once stopped or cancelled the status is terminal for the session; no restart.

5. **`VideoProvider` extension and LiveKit Egress.** Port: `startRecording({ roomSlug, sessionId, mode: 'composite' | 'audio', objectKey }) → { providerRef }` and `stopRecording(providerRef)`. LiveKit implementation uses `EgressClient.startRoomCompositeEgress` with `EncodedFileOutput` to S3 (endpoint, bucket, credentials from `LIVEKIT_EGRESS_S3_*`; MinIO in dev, the Hetzner bucket in prod) with `audioOnly: true` for `audio` mode (no headless browser for that path). Webhooks `egress_started | egress_updated | egress_ended` map to `RECORDING | (FAILED on error status) | READY/FAILED` and carry `egressId`, `startedAt`, `endedAt`, file `location`, `size`, `duration`; idempotent by `(egressId, status)`. Redis is mandatory for Egress and must be shared with the LiveKit server (`redis:` block in both configs).

6. **Data model.** `SessionRecording { id, sessionId unique, mode, status: REQUESTED|STARTING|RECORDING|PROCESSING|READY|FAILED|CANCELLED|EXPIRED|DELETED, cancelReason?, providerRef?, objectKey?, startedAt?, endedAt?, durationSeconds?, sizeBytes?, readyAt?, expiresAt?, deletedAt? }`; `RecordingAccessLog { recordingId, adminId, createdAt }`; `SessionPlaybackEvent { sessionId, at, timeSeconds, playing, seq }` (phase 2). Object keys: `recordings/<sessionId>/<recordingId>.<mp4|ogg>` under the existing videos bucket, so the existing `StorageService.presignGet` serves playback.

7. **Room UI gets recording state through the room descriptor, polled.** `SessionRoomResponse.recording: { status, requested, waitingFor?: 'you' | 'counterpart', cancelReason? } | null`. `session-room.tsx` already refetches the descriptor; it polls every 10 s while the window is open (cheap, no new channel, works for consultation rooms which have no socket). Pre-join consent is a step in `CallPreJoin` shown only when `recording.requested`; confirm/decline posts `POST /sessions/:id/recording/consent { accepted }` before the join call. *Alternative rejected:* pushing over `/playback-sync` — video-analysis only.

8. **Playback and access.** `GET /sessions/:id/recording` (parties; metadata) and `GET /sessions/:id/recording/playback-url` (parties, `READY` only, 10-minute pre-signed URL). `DELETE /sessions/:id/recording` (player only). Admin: `GET /admin/disputes/:id/recording/playback-url` gated on `dispute.status = OPEN`, writes `RecordingAccessLog`. Retention sweep (`RecordingsSweepService`, hourly): `READY` with `expiresAt <= now` → delete object → `EXPIRED`; also stale `STARTING`/`PROCESSING` older than 2 h → `FAILED`.

9. **Phase 2 replay: audio is the master clock.** The gateway writes through *state changes* (play/pause/seek, not heartbeats) to `SessionPlaybackEvent` with `seq` and wall-clock `at` while a recording is `RECORDING` for the session (guarded by an in-memory flag refreshed from the recording status). Replay computes wall time `w = recording.startedAt + audio.currentTime`, picks the last event with `at ≤ w`, derives the attached video position (`timeSeconds + (w − at)` when playing, else `timeSeconds`), keeps the `<video>` within 0.3 s of it (seek on drift, mute the video element), and renders strokes with `createdAtMs ≤ w` for the shown moment. Moment chips seek the audio to the first event that put that moment on screen. *Alternative rejected:* web egress of a recorder page — roughly 1 vCPU per session on the same node for a worse artifact.

10. **Infra.** Compose: `redis:7-alpine`, `livekit/egress:v1.9` (config: redis, ws_url `ws://livekit:7880`, api key/secret, s3 → MinIO). k3s: `redis` Deployment + Service (no persistence; egress state is transient), `egress` Deployment (requests 1 CPU / 1 Gi, limit 2 Gi, `hostNetwork: false`, reaches LiveKit through the `livekit` Service), LiveKit template gets `redis: { address: redis:6379 }`; `apply-secrets.sh` renders `egress.yaml` from the same env file. Default `RECORDING_MAX_CONCURRENT=1`. The audit from change 14 must confirm headroom before enabling recording on staging.

## Risks / Trade-offs

- [Egress + Chrome starves the node during a composite recording] → requests/limits reserve capacity; cap = 1; audio-only path for video analysis; if the resource audit shows no headroom, phase 1 ships behind `RECORDING_MAX_CONCURRENT=0` (feature visible, always "unavailable") until a second node exists.
- [Webhook lost → recording stuck in PROCESSING] → sweep marks stale ones `FAILED`; settlement then refunds the add-on. `SettlementService` waits for a terminal recording status or the stale timeout before releasing (auto-confirm is 48 h, so this never delays a payout noticeably).
- [Player pays, coach declines at pre-join] → automatic add-on refund at settlement; the player is told in-room and in the session view. Repeated declines by a coach are visible to admins via consent rows (moderation follow-up, out of scope).
- [Consent text changes] → versioned; old consents remain valid for their version; new sessions use the new version.
- [Pre-signed URL leakage] → 10-minute TTL, parties only, admin URLs logged and dispute-gated.
- [Replay drift between audio and video] → seek-on-drift with a 0.3 s band; pause the video when the timeline says paused; degrade to audio + annotations if the video is gone.
- [Partial refund semantics vary by real providers] → the port exposes the intent (`refundMinor`); a real adapter can implement it as capture-less-than-authorized or as capture + refund.

## Migration Plan

1. Land `add-annotation-review` first (replay depends on persisted annotations and the review page).
2. Migration adds `ProProfile.recordingAllowed`, `Session.recordingAddonMinor`, `Payment.refundedMinor`, and the four new tables; all additive with defaults.
3. Deploy Redis and Egress, then LiveKit with the `redis:` block (a LiveKit restart drops active calls — schedule it at a quiet hour), then API and web.
4. Ship with `RECORDING_MAX_CONCURRENT=1`; verify one recording on staging; run the resource audit.
5. Phase 2 (audio mode + timeline + replay) can ship separately once phase 1 is verified.

Rollback: set `RECORDING_MAX_CONCURRENT=0` (every recording cancels for capacity, add-ons refund automatically) without redeploying; full rollback reverts the deploy and leaves the tables.

## Open Questions

- Add-on rate: 15% is a placeholder; owner to confirm before launch.
- Whether to show a coach's decline history to admins (moderation) — deferred.
- Retention for the audio + timeline replay: same 90 days as composite recordings, or longer since it is small? MVP uses the same setting.

## Coordination with add-multi-video-attachments (2026-09-12)

Change 18 (`add-multi-video-attachments`) replaced `Session.videoId` with the `SessionVideo` join table, added `videoId` to `PlaybackState` and `Stroke`, and scoped the in-memory annotation state per clip (`AnnotationState` = video id → moment key → strokes). This change must therefore store `videoId` on `SessionPlaybackEvent` rows (index it together with `sessionId`), key any per-session in-memory state per clip, and give its review/replay UI a clip switcher mirroring the room's tabs. `SessionResponse.videos` / `SessionRoomResponse.videos` replace the former `videoId`/`videoTitle` fields.
