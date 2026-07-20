# Tasks — add-availability-scheduling

## 1. Database

- [x] 1.1 Add `AvailabilityRule`, `AvailabilitySlot`, `AvailabilitySlotSource` to `schema.prisma`; relations on `ProProfile`
- [x] 1.2 Create migration; verify `@@unique([profileId, startsAt])` and indexes

## 2. API — availability module

- [x] 2.1 Timezone helper: wall-clock (IANA tz, date, minutes) → UTC instant, DST-correct; unit tests incl. spring-forward/fall-back
- [x] 2.2 Materializer service: expand rules over 28-day horizon, skip existing starts, reconcile rule-sourced open slots after edits; unit tests
- [x] 2.3 Daily cron re-materialization (`@nestjs/schedule`), plus trigger on rule save and on coach timezone change
- [x] 2.4 Coach endpoints: GET `/pros/me/availability`, PUT `/pros/me/availability/rules` (validation: 30-min granularity, ≥60-min windows, no overlap), POST/DELETE manual slot ops
- [x] 2.5 Public endpoint: GET `/pros/:proId/slots` (verified only, open, > now + 2h)
- [x] 2.6 DTOs with class-validator + OpenAPI decorators; service unit tests

## 3. Web — availability dashboard

- [x] 3.1 Shared types for availability payloads in `packages/shared` (done with block 2 — the API DTOs implement these types)
- [x] 3.2 Page `dashboard/availability` with Professional-only guard; nav entry
- [x] 3.3 Weekly template editor (per-weekday ranges, 30-min selects, dirty-state Save, validation errors)
- [x] 3.4 Upcoming-4-weeks slot view grouped by local day, timezone label, per-slot remove + manual add
- [x] 3.5 Message catalog entries for en/fr/de/ru/zh
- [x] 3.6 Calendar-first editing: month grid with per-day open-slot counts, day editor with hour toggles (create/remove slots directly); weekly template collapses into an optional accelerator

## 4. Verification & archive

- [x] 4.1 e2e: template → slots → remove one → edit template → removed stays gone; public endpoint filtering (`scripts/e2e-availability.sh`)
- [x] 4.2 Lint, typecheck, unit, e2e green; manual pass via Tilt
- [x] 4.3 Update `project.md` roadmap (mark change 5 ✅), archive change per `openspec/AGENTS.md`
