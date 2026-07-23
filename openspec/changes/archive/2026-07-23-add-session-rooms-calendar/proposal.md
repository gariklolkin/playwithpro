# Proposal: add-session-rooms-calendar

## Why

Paid sessions currently dead-end at `paid_escrow`: there is no place to actually hold the session and no way for either party to get it into their calendar. This change delivers the session room (embedded Jitsi, with the attached video side by side for video-analysis sessions) and calendar invites, making the booked session actually happen — and unblocking change 9 (confirmation/payouts), which needs sessions to reach `awaiting_confirmation`.

## What Changes

- **Session room page** (`/sessions/[id]/room`): platform-hosted page both parties join at slot time. Embeds a Jitsi room (no accounts required) via a new `VideoProvider` abstraction; for `video_analysis` sessions the coach and player see the attached video player side by side with the call (reusing the existing per-session playback access). In-person `game` sessions have no room — their session page shows the venue address instead.
- **Attendance logging**: each party's join (and leave) in the session room is recorded per session, forming the session evidence trail used by confirmation/disputes in change 9.
- **Lifecycle progression**: `paid_escrow → in_progress` when the slot starts (or on first join), `in_progress → awaiting_confirmation` when the slot ends. Time-driven, enforced by sweep + inline on read paths (same pattern as payment expiry). Confirmation actions themselves stay out of scope (change 9).
- **Calendar invites** via a new `CalendarProvider` abstraction: on payment success both parties receive an `.ics` email invite (reusing the existing mailer). For online services the invite points at the session-room URL; for `game` it carries the venue address. Google Calendar API implementation deferred to a later change (no Google account connection exists yet) — same mock-first pattern as `PaymentProvider`.
- **Dashboard/session-list surfacing**: upcoming sessions get a "join room" affordance (online services) or venue info (game), gated around slot time.

Out of scope: Google Meet / Google Calendar API integrations, synced playback control (`add-synced-playback`, v2), confirmation/release/refund/disputes (change 9).

## Capabilities

### New Capabilities

- `session-rooms`: the platform session room — access control (parties only, time-windowed), Jitsi embed through `VideoProvider`, side-by-side attached-video player for video-analysis, venue display for game sessions, attendance logging, and the time-driven `in_progress` / `awaiting_confirmation` lifecycle transitions.
- `calendar-invites`: `CalendarProvider` abstraction and `.ics` email invites sent to both parties on payment success — session-room URL for online services, venue address for game; cancellation update if the session is cancelled after invite delivery.

### Modified Capabilities

- `booking`: the lifecycle requirement currently declares states past `paid_escrow` unreachable — now `in_progress` and `awaiting_confirmation` become reachable (time-driven); session lists additionally surface the join-room/venue affordance and reflect the new statuses.

## Impact

- **API**: new `session-rooms` module (room descriptor endpoint, join/attendance logging, lifecycle sweep extension), `VideoProvider` port + Jitsi implementation, `CalendarProvider` port + `.ics` mailer implementation hooked into the payment-success path; Prisma migration for attendance records (and room/invite fields on `Session`).
- **Web**: session room page under the localized app router, join gating UI, side-by-side layout for video-analysis, venue block for game, "join room" chips in session lists; new next-intl catalog entries in all five locales.
- **Config**: Jitsi domain, join-window and sweep timings via typed config.
- **Tests**: unit tests for providers/transitions, API e2e for room access + lifecycle + invite triggering (existing `playwithpro_e2e` infra).
