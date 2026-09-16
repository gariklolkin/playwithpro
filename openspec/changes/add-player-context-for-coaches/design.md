## Context

`PlayerCard` (`components/players/player-card.tsx`) renders a `PlayerCardResponse` and is unused. `GET /players/:id` is open to `professional` and `admin`. Session data reaches the web through `SessionResponse` (list/detail, built by `session.mapper.ts` from `SESSION_INCLUDE`) and `SessionRoomResponse` (`session-rooms.service.ts#getRoom`); both know the viewer. The clip set already has an "editable until start while pending_payment/paid_escrow" rule in `session-videos.service.ts` (`EDITABLE_STATUSES` + `startsAt > now`). `PlayerProfile` rows are created lazily on first read with `level = BEGINNER`, so a never-saved profile is indistinguishable from a saved beginner unless we look at `updatedAt`. The room header is shared with change 19's time indicator (right side).

## Goals / Non-Goals

**Goals:** coaches prepare from real context; the player's data has an audience; the endpoint privacy gap is closed; the goal is a first-class, editable part of the booking.

**Non-Goals:** accept/decline bookings, visibility settings, coach notes, goal tags, admin session pages, showing the card to the coach before payment.

## Decisions

1. **The card is embedded, viewer-dependent, computed in the mapper.** `SESSION_INCLUDE.player` gains `playerProfile` (select the detail fields + `createdAt`, `updatedAt`). `toSessionResponse(session, viewer)` sets `playerContext` only when `viewer.role === professional && PAID_STATUSES.includes(status)`; players and any other reader get `null`. One include, no N+1, and the rule lives in one place. `getRoom` reuses the same helper (`toPlayerContext(session, viewer)`) for `SessionRoomResponse`. *Alternative rejected:* keep `GET /players/:id` for coaches and add a session-ownership check — a second access rule to keep in sync, and the list would need one request per entry.

2. **`GET /players/:id` → `@Roles(Role.Admin)`.** Admins keep it (disputes, support). The web has no caller today, so nothing breaks in the UI.

3. **`filled` is derived: `profile !== null && profile.updatedAt > profile.createdAt`.** Prisma sets `updatedAt` only on writes after creation; the lazy `ensureProfile` create leaves them equal. Documented in `player-profile.mapper.ts`; no migration. The player's own `GET /players/me` also returns `filled` so the preview shows the same state the coach sees.

4. **Goal storage and rules.** `Session.goal String? @db.VarChar(500)`; DTO `@IsOptional() @IsString() @MaxLength(500)`, trimmed, empty → `null`. `PATCH /sessions/:id/goal` (`{ goal: string | null }`) in `bookings.controller.ts`, guarded by `assertParty` + player-only (403 for the coach), and the same editability predicate as clips — extracted from `session-videos.service.ts` into `session-access.ts` as `assertEditableBeforeStart(session)` so both features share one rule. No `createdAt` bump semantics needed.

5. **Web placements.**
   - Booking panel: a textarea under the slot picker with a 500-char counter and the "Coaches you book can see this after payment" hint; carried into `POST /bookings` and shown in the pending/checkout summary.
   - Sessions list, player side: the goal shown under the time; "Edit" inline (textarea + save) while `clipsEditable`-equivalent holds (`now < startsAt` and status pending/paid) — the same `now`/status guard already computed in `SessionCard`.
   - Sessions list, coach side: a `<details>`-style disclosure "About the player" for paid statuses containing `PlayerCard` with the goal in a slot below the facts; collapsed by default to keep the list scannable.
   - Room: the same disclosure under the title on the header's left; the header is outside the LiveKit tree, so opening it never reconnects. Change 19 owns the header's right side; whichever change lands second adapts to the other's markup.
   - Profile page: hint paragraph + "How coaches see you" preview (`PlayerCard` fed from the editor's last saved state, including the `filled` flag) — pure client render, no extra request.
   - `PlayerCard` gains `goal?: string | null` and an unfilled state (`filled === false` → avatar + name + a muted "hasn't filled in a profile yet" line, no level).

6. **Statuses for the coach rule are the paid set** `PAID_ESCROW, IN_PROGRESS, AWAITING_CONFIRMATION, COMPLETED_PAID, DISPUTED, RESOLVED`. A cancelled-but-refunded session stays visible in lists (existing rule) but shows no card — the issue's "never for cancelled" wins over "paid at some point".

## Risks / Trade-offs

- [`updatedAt > createdAt` misreads a profile saved within the same millisecond as creation] → practically impossible (creation happens on GET, save on a later PATCH); the mapper compares with `>` so equality means unfilled.
- [Player edits the goal while the coach is reading it in the room] → the room response is fetched on load only; the coach sees the update on the next room load. Acceptable for MVP; noted in the room disclosure ("as of opening the room").
- [Longer session payloads for coaches] → the card is a few short fields; lists are paginated by upcoming/past already.

## Migration Plan

Additive migration `add_session_goal`; deploy API before web (web tolerates `goal`/`playerContext` absent as `undefined → null`). Rollback: redeploy previous images; the column can stay.

## Open Questions

None.
