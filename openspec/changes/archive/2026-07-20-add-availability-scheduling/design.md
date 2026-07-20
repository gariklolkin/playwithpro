# Design — add-availability-scheduling

## Data model

```prisma
enum AvailabilitySlotSource {
  RULE   // materialized from the weekly template
  MANUAL // one-off slot added by the coach
}

/// Recurring weekly window in the coach's wall-clock time.
model AvailabilityRule {
  id          String     @id @default(uuid())
  profileId   String
  weekday     Int        // 0 = Monday … 6 = Sunday (ISO)
  startMinute Int        // minutes from local midnight; multiple of 30
  endMinute   Int        // exclusive; endMinute - startMinute >= 60
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  profile     ProProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId])
}

/// Concrete bookable 60-minute slot. Times are UTC.
model AvailabilitySlot {
  id        String                 @id @default(uuid())
  profileId String
  startsAt  DateTime
  endsAt    DateTime
  status    SlotStatus             @default(OPEN) // reuses OPEN | BOOKED | REMOVED
  source    AvailabilitySlotSource @default(RULE)
  createdAt DateTime               @default(now())
  updatedAt DateTime               @updatedAt
  profile   ProProfile             @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([profileId, startsAt])
  @@index([profileId, status, startsAt])
}
```

Key decisions:

- **Rules store wall-clock minutes, not UTC.** The coach's IANA timezone comes from `User.timezone`. "Mon 18:00" must stay 18:00 local across DST transitions, so UTC conversion happens per concrete date at materialization time. Timezone math uses an `Intl.DateTimeFormat`-based helper (no new runtime dependency); if it proves awkward, fall back to adding `luxon` to `apps/api` only.
- **60-minute slots, starts on :00/:30.** Rule windows are validated to 30-minute granularity; a window `18:00–21:00` yields slots 18:00, 19:00, 20:00 (last start = end − 60 min). Matches per-hour service pricing.
- **`@@unique([profileId, startsAt])` is the idempotency anchor.** Materialization skips any start that already has a row — including `REMOVED` ones, which is exactly how a coach's one-off removal survives regeneration.
- **Reconciliation on rule change**: future `OPEN` slots with `source = RULE` that no longer match any rule are deleted; missing ones are inserted. `MANUAL`, `REMOVED`, and `BOOKED` rows are never touched. (Nothing can be `BOOKED` within this change; the invariant is stated for the booking change to inherit.)
- **Separate tables from `VerificationSlot`** — different owner (coach vs admin), different lifecycle; sharing `SlotStatus` enum is enough reuse.

## Materialization

- Horizon: 28 days ahead of `now`, recomputed by a daily cron (`@nestjs/schedule`, same pattern as `reminders.service.ts`) and synchronously after any rule edit or coach timezone change.
- Idempotent by construction (unique constraint + skip-existing, same pattern as `createSlots` in `scheduling.service.ts`).
- Past slots are never modified; horizon extension only appends.

## API surface (`apps/api/src/availability/`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/pros/me/availability` | coach | rules + slots for the next 28 days (all statuses except removed) |
| PUT | `/pros/me/availability/rules` | coach | replace the full rule set, validate, re-materialize, return updated state |
| POST | `/pros/me/availability/slots` | coach | add a one-off `MANUAL` slot (future, 30-min-aligned start, no overlap) |
| DELETE | `/pros/me/availability/slots/:id` | coach | mark an `OPEN` slot `REMOVED` |
| GET | `/pros/:proId/slots` | public | `OPEN` slots of a **verified** coach, `startsAt > now + 2h`, ISO UTC |

Coach endpoints require `Role.PROFESSIONAL`; rules can be edited at any profile status, but the public endpoint only serves verified profiles.

## Web (`apps/web`)

- New page `app/[locale]/dashboard/availability/page.tsx`, Professional-only (same guard pattern as `dashboard/profile`).
- **Weekly template editor**: seven weekday rows, each holding zero or more `start–end` ranges (30-min step selects); dirty-state Save (matches the profile editor convention from the review feedback).
- **Upcoming slots**: 4-week grid grouped by day in the coach's timezone (timezone labeled, same convention as verification slot picking); per-slot remove, "+ add slot" for manual ones.
- All strings via next-intl in en/fr/de/ru/zh.

## Testing

- Unit: materializer — DST spring-forward/fall-back dates, reconciliation after rule edits, removed-slot persistence, horizon idempotency.
- e2e (Playwright, extending the scheduling suite): coach sets a weekly template → sees generated slots → removes one → edits template → removed slot stays gone, slots follow the new template; public endpoint returns only open verified-coach slots.
