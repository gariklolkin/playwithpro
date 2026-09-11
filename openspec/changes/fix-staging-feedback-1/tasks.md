## 1. Call device notice

- [x] 1.1 `livekit-room.tsx`: pass pre-join choices to `CallStage`; derive `cameraMissing`/`micMissing` from `useLocalParticipant` (`isCameraEnabled`/`isMicrophoneEnabled`) gated by a device-error flag that clears on `LocalTrackPublished`; ignore errors while nothing requested is missing
- [x] 1.2 i18n: `cameraUnavailable`, `micUnavailable`, `mediaUnavailable` (both) in five catalogs

## 2. Unpaid booking

- [x] 2.1 `BookingsService.cancel`: player may cancel `PENDING_PAYMENT` (slot reopens if in the future, `expiresAt` cleared, no settlement, no invite mail); coach still conflict; unit spec + `booking.e2e-spec.ts`
- [x] 2.2 `BookingExpiryService`: cron every minute
- [x] 2.4 Migration `20260911120000_session_slot_not_unique`: drop `Session_slotId_key`, add `Session_slotId_idx`; e2e rebooks a released slot; booking e2e gets the 20 s timeout the settlement suite already uses
- [x] 2.3 `booking-panel.tsx`: for amateurs load `/sessions`, find `pending_payment` with this coach, banner with time + minutes left, Pay → `/booking/<id>`, Release → `POST /sessions/<id>/cancel` then refresh slots; `checkout-panel.tsx`: Release slot action; i18n ×5

## 3. Avatars

- [x] 3.1 `StorageService.avatarUrl(key)` = `${API_URL}/avatars/${key}` (replaces `objectUrl` at the four call sites); `AvatarsController` `GET /avatars/*key` validates `avatars/<uuid>/<uuid>.<ext>` and 302s to `presignGet(key, 3600)` with `Cache-Control: private, max-age=1800`; unit specs updated
- [x] 3.2 `infra/docker-compose.yml`: drop `mc anonymous set download`; note in `infra/k8s/env.example` that no bucket policy is needed

## 4. Verification

- [x] 4.1 lint/tsc/unit/e2e green; dev browser check of the three fixes
- [ ] 4.2 Deploy to staging and re-test with the owner (device notice with a second person, avatar, unpaid booking)
