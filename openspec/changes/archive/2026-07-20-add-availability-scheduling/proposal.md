# add-availability-scheduling

## Why

Verified coaches currently have no way to tell the platform when they can take sessions. Availability is the prerequisite for the booking flow (`add-booking-escrow`): amateurs must see concrete bookable time slots on a coach's profile. The verification-scheduling change already proved the slot mechanics (UTC storage, race-safe conditional updates, batch publication) — this change brings the same mechanics to coach-owned availability, driven by a recurring weekly template instead of manual admin publication.

## What Changes

- **Weekly availability rules**: a verified coach defines recurring weekly windows ("Mon 18:00–21:00, Wed 18:00–21:00") in their own timezone. Wall-clock times are stored as entered; conversion to UTC happens per concrete date, so DST shifts keep the local time stable.
- **Slot materialization**: the system expands rules into concrete 60-minute `AvailabilitySlot` rows on a rolling 28-day horizon (daily job + immediate regeneration on rule edits). Slots are the single bookable unit the future booking flow will consume.
- **Per-slot overrides**: the coach can remove any generated slot (day off, one-off conflict) and add one-off manual slots outside the weekly template. Removed slots stay removed across regenerations.
- **Public open-slot listing**: an endpoint returns a verified coach's open future slots (minimum 2-hour notice), rendered in the viewer's timezone — consumed by the coach's own dashboard now and by the booking flow later.
- **Coach dashboard "Availability" page** (`/dashboard/availability`): weekly template editor plus an upcoming-4-weeks grid with slot toggles, in all 5 locales.

Out of scope (later roadmap changes): amateur-facing catalog/coach page, booking itself, payments, Google Calendar sync of coach availability.

## Impact

- **DB**: new models `AvailabilityRule`, `AvailabilitySlot`; new enum value usage of existing `SlotStatus`. One migration.
- **API**: new `availability` module — coach CRUD endpoints, public listing endpoint, materializer service + daily cron.
- **Web**: new dashboard page + nav entry (Professional role only), message catalog additions for en/fr/de/ru/zh.
- **Specs**: new capability `availability`.
