## Context

`SessionRoom` (`apps/web/components/sessions/session-room.tsx`) already runs a one-second countdown before the join window opens, computed from `opensAt` against `Date.now()`. Once the window is open the header shows only the start time. `GET /sessions/:id/room` returns `startsAt`, `endsAt`, `opensAt`, `closesAt` but no server time. The call itself is `LiveKitCall` (client-only bundle) with a stable place in the tree so layout changes never remount `LiveKitRoom`; the header sits outside that grid. There is no toast primitive in the web app (the closest is `role="status"` output in the clip picker). The video-analysis clip card can go fullscreen via `requestFullscreen` on the card element, which hides everything outside it. Session progression is clock-driven on the API (change 8) and must stay untouched.

Constraints: no new dependencies; five locales; no DB change; the reminder is informational only.

## Goals / Non-Goals

**Goals:**
- Both parties see the same remaining time regardless of their device clocks.
- A clear, non-intrusive nudge at T-10 min and T-0 during the call.
- Zero impact on the call connection, layouts, and session progression.

**Non-Goals:**
- Cutting the call at `endsAt`, extending the session, per-user reminder settings, sound/vibration, reminders outside the room page (email/push reminders are the `reminders.service.ts` domain and unchanged), coach-side "wrap up" prompts, any change to the join window.

## Decisions

1. **Server time rides on the room response as `serverNow`.** `getRoom` already computes `now` for the join-window check; it is serialized as `serverNow` (ISO). The client computes `offset = serverNow − Date.now()` at receipt and uses `Date.now() + offset` for every computation; the one-way latency error (tens of ms) is irrelevant at second resolution. *Alternatives rejected:* the HTTP `Date` header (second resolution, stripped by some proxies, awkward through `apiFetch`); a dedicated `/time` endpoint (an extra round trip for nothing).

2. **One hook owns the clock: `useSessionClock(room, active)` in `lib/use-session-clock.ts`.** It takes the room response and whether the party is in the call, ticks once per second with `setInterval` (aligned to the next second boundary), and returns `{ phase: "before" | "during" | "over", remainingMs, label }` plus fires `onThreshold(kind)` callbacks for `"tenMinutes"` and `"end"`. Thresholds fire only on a *crossing* observed while `active` is true: the hook records the phase at activation, so a party who connects with 7 minutes left never gets the T-10 toast, but does get T-0. The pre-join countdown in `session-room.tsx` is migrated onto the same offset so the two countdowns can never disagree. *Alternative rejected:* deriving thresholds inside `LiveKitCall` — it would couple the SDK bundle to session timing and complicate the phase/remount invariants.

3. **Indicator placement: the header's right side, next to "Back to sessions".** A `tabular-nums` pill: `⏱ 12:34 left`, `Starts in 3:10`, `+2:15 over`. Colour shifts to the warning token at ≤10 min and to the danger token when over. The header is outside the theatre grid, so the indicator is visible in stage, rail and focus layouts alike; nothing inside `LiveKitRoom` changes. Change 23 will add a disclosure on the header's left side; the two do not collide.

4. **A tiny toast primitive: `components/sessions/room-toast.tsx`.** A bottom-centre stack rendered through `createPortal` into `document.fullscreenElement ?? document.body`, re-evaluated on `fullscreenchange` so a toast that fires while the clip card is fullscreen lands inside the card. Each toast: icon, text, close button, auto-dismiss after 8 s (end reminder 12 s), `role="status"` + `aria-live="polite"`, pointer events limited to the toast itself. Scoped to the room (not a global provider) because no other page needs toasts yet; when change 24 or 25 needs a global one, this component moves to `components/ui/` unchanged. *Alternative rejected:* adding `sonner` — a dependency for two messages.

5. **Constants live in shared.** `CALL_TIME_REMINDER_BEFORE_END_MIN = 10` in `packages/shared/src/types/session-room.ts` next to `SessionRoomResponse`, so a future API-side reminder (e.g. a socket push) uses the same number. The tick interval and toast durations are web-local constants.

6. **The end reminder names the closing time.** `closesAt` is already in the response; the toast renders it with the existing `LocalTime` formatting (viewer timezone) so "you can keep talking until 15:10" is unambiguous.

## Risks / Trade-offs

- [The tab is backgrounded and timers are throttled, so the toast fires late] → the hook computes from absolute timestamps on every tick, not from tick counts; a late tick still fires the correct threshold once, and the indicator is right the moment the tab is visible again.
- [The room response is refetched (window opens) and the offset shifts by a few ms] → the offset is recomputed on every successful load; jitter is below the display resolution.
- [A reminder toast overlaps the annotation toolbar or the player bar] → bottom-centre stack with a 24 px offset above the player bar in theatre layout; the toast is small and dismissible.
- [A late API deploy without `serverNow`] → the hook falls back to `Date.now()` when the field is absent; the web build that ships the hook is deployed together with the API as usual.

## Migration Plan

No migration. Deploy API and web together (additive response field; the web tolerates its absence). Rollback is a plain redeploy of the previous images.

## Open Questions

None. Lead time (10 min) and non-cut-off behaviour were fixed by the owner in the roadmap entry.
