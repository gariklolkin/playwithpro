# Design: add-session-rooms-calendar

## Context

Sessions stop at `paid_escrow` (bookings module handles pay + expiry sweep). There is no session room, no `VideoProvider`/`CalendarProvider`, and no attendance data. Infra we build on: `MailerService` (verification emails), per-session coach playback access (`session-access.ts` + `GET /videos/:id/playback-url`), the expiry-sweep pattern (`booking-expiry.service.ts`: periodic + startup + inline), typed config module, `ProProfile.venueLabel/venueLat/venueLng` for game sessions, localized app-router web app. Scope decision (owner): Jitsi + `.ics` email only; Google Meet/Calendar deferred until Google account connection exists.

## Goals / Non-Goals

**Goals:**
- Platform session room both parties join, with embedded Jitsi and (for video-analysis) the attached video side by side.
- Attendance trail per session, usable as evidence in change 9.
- Time-driven lifecycle: `paid_escrow → in_progress → awaiting_confirmation`.
- `.ics` invites to both parties on payment success; cancellation update on post-payment cancellation.
- Provider ports (`VideoProvider`, `CalendarProvider`) that Google implementations can slot into later without touching business logic.

**Non-Goals:**
- Google Meet / Google Calendar API, OAuth account connection.
- Synced playback control (v2 `add-synced-playback`).
- Confirmation actions, payouts, disputes (change 9 — it consumes `awaiting_confirmation` and attendance).
- Self-hosted Jitsi / JWT-secured rooms (hardening later; MVP uses the public Jitsi instance).

## Decisions

### D1. Room identity: random slug stored on Session at payment time
Add `Session.roomSlug` (nullable, set when payment succeeds, online services only): `<sessionId-prefix>-<128-bit random base32>`. The Jitsi room name derives from it; the invite's session-room URL is stable from the moment the invite is sent.
- *Why not derive from session id alone*: public Jitsi rooms are joinable by name — guessable names leak calls. Random slug ≈ capability token.
- *Why store, not compute per request*: invites embed the room URL once; regeneration would orphan them.

### D2. `VideoProvider` port returns a room descriptor; Jitsi impl is computation-only
Port (`apps/api/src/session-rooms/video-provider.ts`, DI token `VIDEO_PROVIDER`): `getRoom(session) → { kind: 'embedded_jitsi', domain, roomName } | { kind: 'external_url', url }` (the second variant is the future Meet shape). Jitsi impl composes `domain` from config (`JITSI_DOMAIN`, default `meet.jit.si`) + `roomSlug`; it performs no network calls. Mirrors the `PaymentProvider` mock-first pattern.

### D3. `CalendarProvider` port with `.ics` mailer implementation
Port (`apps/api/src/calendar/calendar-provider.ts`, DI token `CALENDAR_PROVIDER`): `sendInvite(session)` / `sendCancellation(session)`. Ics impl builds an RFC 5545 VEVENT — `UID` = session id @ platform domain, `SEQUENCE` bumped on cancellation (`METHOD:CANCEL`), `DTSTART/DTEND` in UTC, `LOCATION` + description link = session-room URL for online services, venue label for game — and sends via `MailerService` to both parties as an `text/calendar; method=REQUEST` attachment. No new external dependency decision needed beyond an ics builder (hand-rolled template or tiny lib; VEVENT surface here is small — prefer hand-rolled in `IcsCalendarProvider` to avoid a dependency).

### D4. Invite dispatch: post-commit, idempotent, non-blocking
Hook after the `PAID_ESCROW` transaction commits in `bookings.service.pay()`. Failure to send logs an error but never fails the payment (money state > notification state). Add `Session.inviteSentAt` to make dispatch idempotent across payment retries/races. Cancellation email only if `inviteSentAt` is set.

### D5. Lifecycle transitions are clock-driven, not join-driven
`paid_escrow → in_progress` at `startsAt`, `in_progress → awaiting_confirmation` at `endsAt`, enforced exactly like payment expiry: periodic sweep (extend/sibling of `booking-expiry.service.ts`, also at startup) + inline normalization on session read paths. Attendance is recorded data, not a transition trigger.
- *Why*: deterministic, no dependence on flaky client events; a no-show session still reaches `awaiting_confirmation`, where change 9's dispute flow handles it. Alternatives (transition on first join) leave never-joined sessions stuck.

### D6. Attendance: explicit join events, best-effort leave
New model `SessionAttendance` (id, sessionId, userId, joinedAt, leftAt?, index on sessionId). Room page calls `POST /sessions/:id/room/join` when the user lands (creates a row), and a heartbeat/`navigator.sendBeacon` leave updates `leftAt` best-effort. Multiple rows per user per session are fine (rejoins). Evidence, not state.

### D7. Room access: parties only, time-windowed
`GET /sessions/:id/room` (descriptor: provider info, role, video attachment, timing) is party-only (reuse the not-found-for-third-party convention) and joinable from `startsAt − JOIN_WINDOW_BEFORE_MIN` (default 15) until `endsAt + JOIN_WINDOW_AFTER_MIN` (default 30); outside the window the endpoint returns timing metadata but no room descriptor, and the page shows a countdown/closed state. Statuses `PAID_ESCROW | IN_PROGRESS | AWAITING_CONFIRMATION` (within window) admit; game sessions have no room route — their session detail shows the venue block.

### D8. Web: room page under localized router, direct Jitsi iframe
`/[locale]/sessions/[id]/room`: embeds the call as a **plain iframe** (`{origin}/{roomName}#userInfo.displayName=…`, `allow="camera; microphone; display-capture; …"`). Jitsi's `external_api.js` is deliberately not used: it hardcodes `https://`, which breaks the cert-free plain-HTTP dev stack on localhost, and it executes third-party script in our page; attendance is tracked by our own API calls, not Jitsi events. `JITSI_DOMAIN` accepts a bare host (https assumed) or a full origin (`http://localhost:8000`). For video-analysis the page renders the existing playback player (signed URL via `GET /videos/:id/playback-url`, which already admits the session coach) side by side — stacked on mobile per DESIGN.md breakpoints. Session lists get a "Join room" chip (gated by the same window) or venue chip for game. All strings via next-intl in the 5 locales.

## Risks / Trade-offs

- [Public meet.jit.si rooms are open to anyone with the name] → 128-bit random slug never exposed outside the party-only descriptor endpoint and the invite email; JWT/self-hosted Jitsi listed as later hardening.
- [**Materialized during testing**: public Jitsi instances cannot host embedded accountless rooms — meet.jit.si requires a Jitsi-authenticated "moderator" to start meetings, meet.ffmuc.net forbids iframes via `frame-ancestors`, framatalk.org renders blank when framed] → dev now runs **self-hosted Jitsi** in `infra/docker-compose.yml` (jitsi/web+prosody+jicofo+jvb over plain HTTP, `JITSI_DOMAIN=http://localhost:8000` — localhost is a secure context, so no certificate step for anyone). For production: hosted Jitsi behind real HTTPS, or JaaS with JWT.
- [Invite email lands in spam / mailer down] → invite failure never blocks payment; session room link also visible in dashboard, so email is a convenience, not the only path.
- [Clock-driven `in_progress` on a session nobody joined] → intentional; change 9's confirmation/dispute window is the corrective mechanism, attendance rows prove absence.
- [Jitsi embed blocked by CSP/permissions-policy misconfig] → verify in browser smoke against Tilt; keep domain in config so a self-hosted fallback is a env change.
- [Leave events unreliable (tab close)] → `leftAt` is best-effort by design; `joinedAt` alone is the primary evidence.
- [Tilt live_update does not sync `apps/web/components/` and `messages/`] → expect full web-image rebuilds during UI work (known quirk).

## Migration Plan

Additive Prisma migration only: `SessionAttendance` table; `Session.roomSlug`, `Session.inviteSentAt`. No backfill (existing paid sessions predate rooms; slug/invite generated only on new payments — acceptable pre-launch). Rollback = revert migration; no data loss risk to existing flows.

## Open Questions

None blocking. Deferred explicitly: Google providers (needs account-connection change), Jitsi hardening (JWT/self-host), synced playback (v2).
