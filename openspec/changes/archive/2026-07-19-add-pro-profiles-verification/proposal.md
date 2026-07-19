# Change: add-pro-profiles-verification

## Why

Amateurs pay only for sessions with **verified** professionals — trust is the marketplace's core asset. Before availability and booking can land, a coach needs a complete profile (what they offer, in which languages, at what price) and the platform needs an admin flow that turns "someone who registered as a professional" into "a verified pro."

## What Changes

- **Pro profile (coach-owned):** bio, achievements, spoken languages (from the platform's five), country/city; the profile belongs 1:1 to a `PROFESSIONAL` user and starts as a draft.
- **Services & pricing:** up to three services per coach — `video_analysis`, `consultation`, `game` — each with an hourly price in integer minor units + ISO 4217 currency. The in-person `game` service additionally requires city and club/venue. Services can be toggled active/inactive.
- **Verification submission:** once the profile is complete (bio, ≥1 language, ≥1 active service), the coach submits credentials — free-text achievements/credentials plus evidence links (federation profile, rating page, press). Submission moves the profile to `pending_review`. Re-submission allowed after rejection.
- **Admin verification queue:** admins list pending requests, inspect the full profile, and approve (profile becomes `verified`) or reject with a required note shown to the coach.
- **Web:** professional dashboard gets a "My profile" editor (profile fields, services, verification status banner + submit); admin dashboard gets the "Verification queue" (list + detail with approve/reject). All strings in the five locale catalogs.
- **Email:** notify the coach on approve/reject (English, consistent with existing mailer).

**New capability specs:** `pro-profiles`, `pro-verification`

## Impact

- Affected specs: `pro-profiles` (new), `pro-verification` (new)
- Affected code: `apps/api` (Prisma models `ProProfile`, `ProService`, `VerificationRequest` + migration; new `pros` and `admin` modules; mailer templates), `apps/web` (profile editor under `/dashboard/profile`, admin queue under `/dashboard/verification`, message catalogs ×5), `packages/shared` (ServiceType enum, profile/verification status enums, DTO types)
- Non-goals: public catalog & public profile pages (land with booking), file/document upload for credentials (needs `add-video-upload`'s S3 plumbing; links suffice for MVP), availability slots, reviews/ratings, payouts
