## 1. Shared contract and API

- [x] 1.1 Shared: add `serverNow: string` to `SessionRoomResponse` and export `CALL_TIME_REMINDER_BEFORE_END_MIN = 10` from `packages/shared/src/types/session-room.ts`
- [x] 1.2 API: `session-rooms.service.ts#getRoom` sets `serverNow` from the same `now` used for the join-window check; controller/Swagger DTO updated
- [x] 1.3 Tests: unit spec asserts `serverNow` is ISO and within the request's time; `test/session-rooms.e2e-spec.ts` asserts the field on the room response

## 2. Web — clock hook and toast primitive

- [x] 2.1 `lib/use-session-clock.ts`: server offset from `serverNow` (fallback `Date.now()`), 1 s tick aligned to the second, `{ phase, remainingMs, label }`, threshold crossings (`tenMinutes`, `end`) fired only while `active` and only when crossed after activation
- [x] 2.2 `components/sessions/room-toast.tsx`: portal into `document.fullscreenElement ?? document.body` (re-evaluated on `fullscreenchange`), auto-dismiss (8 s / 12 s), close button, `role="status"` + `aria-live="polite"`
- [x] 2.3 Unit tests (fake timers): offset correction with a skewed client clock; before/during/over labels; T-10 and T-0 fire once each; late joiner skips T-10; no callbacks while inactive; toast auto-dismiss and portal target

## 3. Web — session room integration

- [x] 3.1 `session-room.tsx`: header indicator pill (right side, `tabular-nums`, warning colour ≤10 min, danger colour when over); migrate the pre-join countdown onto the shared offset
- [x] 3.2 Wire `useSessionClock` with `active = callPhase === "in-call"`; T-10 toast and T-0 toast (with `closesAt` via `LocalTime`); toasts unmount when the room closes
- [x] 3.3 i18n: `sessions.room.time.{startsIn,left,over,reminderTen,reminderEnd,dismiss}` in en/fr/de/ru/zh
- [x] 3.4 `session-room-layout.test.tsx`: indicator present in stage, rail and focus layouts; toast rendered inside a fake fullscreen element

## 4. Verification

- [x] 4.1 Lint, tsc, api unit + e2e, web vitest green
- [x] 4.2 Browser smoke (dev fixtures, two browsers): shift the smoke session's `endsAt` so T-10 and T-0 fall within a minute; confirm both parties see the same countdown and each toast once, the call stays connected past `endsAt`, and the toast is visible while the clip card is fullscreen
- [x] 4.3 Roadmap line 19 in `openspec/project.md` updated to implemented; archive after staging verification
