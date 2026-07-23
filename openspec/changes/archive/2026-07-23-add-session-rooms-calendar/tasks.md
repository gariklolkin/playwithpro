# Tasks: add-session-rooms-calendar

## 1. Data model & config

- [x] 1.1 Prisma migration: `SessionAttendance` model (id, sessionId, userId, joinedAt, leftAt?, index on sessionId) + `Session.roomSlug` (nullable) and `Session.inviteSentAt` (nullable)
- [x] 1.2 Typed config: `JITSI_DOMAIN` (default `meet.jit.si`), join window lead/grace minutes, session-progression sweep interval, public web base URL for room links

## 2. Providers

- [x] 2.1 `VideoProvider` port (`apps/api/src/session-rooms/video-provider.ts`, DI token `VIDEO_PROVIDER`) with room-descriptor result union (`embedded_jitsi` | `external_url`)
- [x] 2.2 Jitsi implementation: compose domain + room name from `roomSlug`; unit tests (no room for game/unpaid, stable output)
- [x] 2.3 `CalendarProvider` port (`apps/api/src/calendar/calendar-provider.ts`, DI token `CALENDAR_PROVIDER`) with `sendInvite`/`sendCancellation`
- [x] 2.4 `IcsCalendarProvider`: hand-rolled RFC 5545 VEVENT (UID = session id @ platform, UTC DTSTART/DTEND, LOCATION = room URL or venue, METHOD REQUEST/CANCEL with SEQUENCE bump), sent via `MailerService` to both parties; unit tests over the generated ICS

## 3. Payment-success hook

- [x] 3.1 On `pending_payment → paid_escrow` commit in `bookings.service.pay()`: generate `roomSlug` (online services only), then dispatch invite post-commit — idempotent via `inviteSentAt`, failures logged and never failing the payment
- [x] 3.2 Cancellation path: when a session with `inviteSentAt` is cancelled, send calendar cancellation; unpaid expiry sends nothing
- [x] 3.3 Unit tests: slug only for online services, no duplicate invite on repeated pay processing, invite failure keeps `PAID_ESCROW`

## 4. Session progression sweep

- [x] 4.1 Progression service (sibling of `booking-expiry.service.ts`): `PAID_ESCROW → IN_PROGRESS` at `startsAt`, `IN_PROGRESS → AWAITING_CONFIRMATION` at `endsAt`; periodic + startup run
- [x] 4.2 Inline normalization on session read paths (lists, detail, room descriptor) so stale statuses are corrected before the sweep
- [x] 4.3 Unit tests for both transitions and read-path normalization

## 5. Session room API

- [x] 5.1 `GET /sessions/:id/room`: party-only (not-found otherwise), online services only; returns timing metadata always, joinable descriptor (provider info, role, attached video id) only within the join window and in statuses `PAID_ESCROW | IN_PROGRESS | AWAITING_CONFIRMATION`
- [x] 5.2 `POST /sessions/:id/room/join` records a `SessionAttendance` row (window-gated, parties only); leave endpoint/heartbeat updates `leftAt` best-effort
- [x] 5.3 Extend session list/detail payloads with status (`in_progress`/`awaiting_confirmation`), join-window flags, and venue info for game sessions
- [x] 5.4 API e2e (`playwithpro_e2e`): room access matrix (party/third-party/too-early/game), attendance rows on join/rejoin, progression transitions, invite idempotency

## 6. Web: session room page

- [x] 6.1 Route `/[locale]/sessions/[id]/room`: fetch descriptor; countdown (too early), closed state, join state; times in viewer timezone
- [x] 6.2 Jitsi embed via `external_api.js` from configured domain; CSP/permissions (`camera; microphone; display-capture`) adjustments in Next config
- [x] 6.3 Video-analysis layout: attached-video player (existing signed playback URL, coach admitted) side by side with the call, stacked at <900px; no video panel for consultation
- [x] 6.4 Join/leave attendance calls from the room page (join on enter, `sendBeacon` leave best-effort)

## 7. Web: lists & venue

- [x] 7.1 "Join room" chip on upcoming paid online sessions in player/coach lists, gated by the join window; venue chip/block for game sessions (session detail shows `venueLabel`)
- [x] 7.2 Status labels for `in_progress` / `awaiting_confirmation` in lists and detail

## 8. i18n & polish

- [x] 8.1 next-intl catalog entries for all new UI (room states, join controls, venue block, status labels, invite-related copy) in en/fr/de/ru/zh; no hard-coded strings
- [x] 8.2 Browser smoke against Tilt: book → pay → invite email visible (Mailpit/dev mailer), join room from dashboard, Jitsi loads, video side-by-side for video-analysis (expect full web-image rebuilds for `components/`/`messages/` changes)

## 9. Wrap-up

- [x] 9.1 `openspec validate --changes add-session-rooms-calendar --specs`, full unit + e2e suites green, typed-lint clean
- [x] 9.2 Update `openspec/project.md` roadmap notes if scope shifted; ready for archive per AGENTS.md
- [x] 9.3 **Before archiving**: remove the TEMPORARY `ROOM_JOIN_WINDOW_BEFORE_MIN`/`ROOM_JOIN_WINDOW_AFTER_MIN: 43200` override from `infra/docker-compose.yml` (added 2026-07-21 for manual room testing) and restart the api container — restores the 15-min-before / 30-min-after join window
