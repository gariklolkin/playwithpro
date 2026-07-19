# Design: add-pro-profiles-verification

## Context

Auth/roles/sessions exist (`add-auth-and-accounts`), i18n routing and 5 catalogs exist (`add-i18n`). The professional and admin dashboards are empty shells with nav items already labeled ("My profile", "Verification queue"). No S3 uploads yet — credentials are text + links.

## Data model

```prisma
enum ProProfileStatus { DRAFT PENDING_REVIEW VERIFIED REJECTED }
enum ServiceType      { VIDEO_ANALYSIS CONSULTATION GAME }
enum VerificationStatus { PENDING APPROVED REJECTED }

model ProProfile {
  id           String @id @default(uuid())
  userId       String @unique            // 1:1 with a PROFESSIONAL user
  status       ProProfileStatus @default(DRAFT)
  bio          String @default("")
  achievements String @default("")
  languages    String[]                  // ISO 639-1, subset of platform locales
  country      String @default("")
  city         String @default("")
  services     ProService[]
  verificationRequests VerificationRequest[]
}

model ProService {
  id          String @id @default(uuid())
  profileId   String
  type        ServiceType
  priceMinor  Int                        // money: integer minor units
  currency    String @db.Char(3)         // ISO 4217
  venueCity   String @default("")        // GAME only
  venueClub   String @default("")        // GAME only
  active      Boolean @default(true)
  @@unique([profileId, type])
}

model VerificationRequest {
  id          String @id @default(uuid())
  profileId   String
  status      VerificationStatus @default(PENDING)
  credentials String                     // free text
  links       String[]                   // evidence URLs
  adminNote   String @default("")        // required on reject
  reviewedById String?
  reviewedAt  DateTime?
  createdAt   DateTime @default(now())
}
```

Decisions:
- **Profile status lives on the profile**, requests are an audit trail (a profile can have several requests after rejections; the newest `PENDING` one is "the" queue item).
- **Rejection returns the profile to `REJECTED`** (not `DRAFT`) so the UI can show the admin note; editing and re-submitting moves it back to `PENDING_REVIEW`.
- **Editing a `VERIFIED` profile does not reset verification** in MVP — verification vouches for identity/credentials, not each bio word. Revisit if abused.
- `languages` values validated against `SUPPORTED_LOCALES` from `packages/shared` — same 5 languages the platform speaks; matches the later catalog filter.
- Prices: per-service **hourly** rate, `priceMinor` + `currency` (no floats). Currency free-form ISO code, default `EUR` in UI; per-currency policy comes with payments.

## API surface (NestJS, `pros` + `admin` modules)

Coach (JWT + `PROFESSIONAL` role; a missing profile is lazily created on first read):
- `GET  /pros/me/profile` — profile incl. services + latest verification request
- `PATCH /pros/me/profile` — bio, achievements, languages, country, city
- `PUT  /pros/me/services/:type` — upsert one service (price, currency, venue, active)
- `DELETE /pros/me/services/:type`
- `POST /pros/me/verification` — { credentials, links[] }; 409 unless profile complete (bio non-empty, ≥1 language, ≥1 active service) and status is DRAFT/REJECTED

Admin (JWT + `ADMIN` role):
- `GET  /admin/verification-requests?status=pending` — queue with profile + user summary
- `POST /admin/verification-requests/:id/approve`
- `POST /admin/verification-requests/:id/reject` — { note } required

DTO validation with class-validator; shared response/enum types in `packages/shared` (mirroring the auth change's pattern of TS enums mirroring Prisma enums).

## Web

- `/dashboard/profile` (professional-only, same guard pattern as settings): profile form, three service cards (enable + price + venue for game), verification card — status banner (draft/pending/verified/rejected+note) and submit form.
- `/dashboard/verification` (admin-only): pending list; row expands (or links) to detail — full profile, credentials, links; approve / reject-with-note actions.
- Reuse existing form components (`Input`, `Label`, `Button`, settings card pattern). New strings go to all five catalogs (parity test enforces).

## Emails

Two mailer templates (English): "You're verified 🎉" and "Verification update" with the admin note. Fire-and-forget like existing verification emails.

## Risks / Trade-offs

- **No document upload** — links-only evidence weakens verification, acceptable for MVP; S3 plumbing arrives with `add-video-upload`, then a follow-up can add attachments.
- **Lazy profile creation** avoids a signup-time migration/backfill for existing professional users.
- Admin UI lives in the dashboard shell rather than a separate console — `add-admin-console` will absorb/extend it later.

## Amendments after owner review (2026-07-18)

- **No profile country/city** — the game venue carries location; profile fields dropped everywhere.
- **Game venue = map pick**: OSM/Nominatim address search + draggable Leaflet pin; stored as `venueLabel` + `venueLat`/`venueLng` (floats are fine for coordinates; money stays integer). Feeds calendar invites and geo-search later.
- **Verification includes an identity video call**: evidence links dropped; submission requires a contact (messenger/phone). Admin queue gets "Invite to video call" → stamps `callRequestedAt`, emails the coach. Upgrade path: once `add-session-rooms-calendar` lands, verification calls move into platform video rooms.
