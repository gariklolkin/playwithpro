## 1. Data model and shared contract

- [x] 1.1 Prisma: `Session.goal String? @db.VarChar(500)` + migration `add_session_goal`
- [x] 1.2 Shared: `PlayerCardResponse.filled`, `PlayerProfileResponse.filled`, `SessionResponse.goal` + `playerContext: PlayerCardResponse | null`, `SessionRoomResponse.goal` + `playerContext`, `CreateBookingRequest.goal?`, `UpdateSessionGoalRequest`, `SESSION_GOAL_MAX_LENGTH = 500`

## 2. API — access rule, goal, endpoint changes

- [x] 2.1 `players.controller.ts`: `GET /players/:id` → `@Roles(Role.Admin)`; `player-profile.mapper.ts` derives `filled` (`updatedAt > createdAt`); `players.service.spec.ts` updated
- [x] 2.2 `session.mapper.ts`: include `player.playerProfile`; `toPlayerContext(session, viewer)` (coach viewer + paid statuses only); `goal` mapped for both parties; `session.mapper.spec.ts` covers player/coach/unpaid/cancelled
- [x] 2.3 `CreateBookingDto.goal` (optional, trimmed, ≤ 500, empty → null) persisted on create; `PATCH /sessions/:id/goal` (player only, `assertEditableBeforeStart` extracted to `session-access.ts` and reused by `session-videos.service.ts`)
- [x] 2.4 `session-rooms.service.ts#getRoom`: `goal` + `playerContext` via the shared helper
- [x] 2.5 e2e: coach 403 on `/players/:id`, admin 200; card present for the coach on a paid session and absent for the player / on pending and cancelled; goal set at booking, edited before start, 409 after start, 403 for the coach, 400 over 500 chars; room response carries goal + card for the coach only

## 3. Web — player side

- [x] 3.1 `booking-panel.tsx`: goal textarea with counter and visibility hint; sent on booking; shown in the pending summary; `checkout-panel.tsx` shows the goal in the summary
- [x] 3.2 `sessions-list.tsx` (player): goal line + inline edit until start (`PATCH /sessions/:id/goal`), same guard as the clip editor
- [x] 3.3 `player-profile-editor.tsx`: visibility hint + "How coaches see you" preview using `PlayerCard` with the last saved state
- [x] 3.4 `player-card.tsx`: `goal` slot and unfilled state

## 4. Web — coach side

- [x] 4.1 `sessions-list.tsx` (coach): collapsed "About the player" disclosure (card + goal) on paid entries only
- [x] 4.2 `session-room.tsx`: header disclosure under the title for the coach in both room types; verify no LiveKit remount (existing layout test extended)
- [x] 4.3 i18n: `playerProfile.visibility.*`, `playerProfile.card.unfilled`, `booking.goal.*`, `sessions.goal.*`, `sessions.aboutPlayer.*` ×5
- [x] 4.4 Unit tests: booking panel sends the goal; list shows/edits the goal for the player and the disclosure for the coach on paid entries only; card unfilled state; profile preview mirrors the editor state

## 5. Verification

- [x] 5.1 Lint, tsc, api unit + e2e, web vitest green
- [ ] 5.2 Browser smoke with dev fixtures: book with a goal → checkout summary → pay → coach list disclosure → room disclosure (call stays connected) → player edits goal before start → after start the edit is refused; unfilled-profile fixture shows the empty state
- [ ] 5.3 Roadmap line 23 in `openspec/project.md` updated (done 2026-09-16); archive after staging verification
