# Tasks: add-pro-profiles-verification

## 1. Data layer & shared types
- [x] 1.1 Prisma models `ProProfile`, `ProService`, `VerificationRequest` + enums; migration committed
- [x] 1.2 `packages/shared`: ServiceType/ProProfileStatus/VerificationStatus enums, profile/service/verification DTO types

## 2. API — coach profile & services
- [x] 2.1 `pros` module: `GET/PATCH /pros/me/profile` (lazy draft creation), role guard
- [x] 2.2 `PUT/DELETE /pros/me/services/:type` with price/currency validation; venue required for `game`
- [x] 2.3 Unit tests: role guard, lazy creation, service upsert, game-venue and language validation

## 3. API — verification & admin queue
- [x] 3.1 `POST /pros/me/verification` with completeness + status checks; `GET` latest status in profile response
- [x] 3.2 Admin endpoints: list pending, approve, reject (note required); reviewer + timestamp recorded
- [x] 3.3 Mailer templates + send on approve/reject
- [x] 3.4 Unit tests: completeness rules, double-submit, resubmit-after-reject, admin transitions, note-required

## 4. Web — coach profile editor
- [x] 4.1 `/dashboard/profile` page (professional-only guard): profile form, three service cards, verification card with status banner + submit
- [x] 4.2 Wire professional dashboard nav item to the page
- [x] 4.3 Strings in all five catalogs; component tests for the editor and submit flow

## 5. Web — admin verification queue
- [x] 5.1 `/dashboard/verification` page (admin-only guard): pending list, detail view, approve/reject with note
- [x] 5.2 Wire admin dashboard nav item; strings ×5; component tests

## 7. Review feedback (owner, 2026-07-18)
- [x] 7.1 Drop profile country/city fields (UI, API, DB)
- [x] 7.2 Replace evidence links with a required video-call contact; admin "Invite to video call" + email
- [x] 7.3 Game venue via map: OSM/Nominatim address search + draggable pin (label + lat/lng)

## 6. Verification & archive
- [x] 6.1 E2E happy path against Tilt env (fill profile → submit → admin approves → status verified; reject path with note)
- [x] 6.2 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; CI green
- [ ] 6.3 STOP — request owner review before archiving; archive only after approval
