# Tasks: update-signup-timezone

## 1. API
- [x] 1.1 `timezone?` in shared RegisterRequest/OAuthCompleteRequest; RegisterDto + OAuthCompleteDto with `@IsTimeZone`; stored on user creation in both flows
- [x] 1.2 Unit tests: timezone stored, absent → UTC default

## 2. Web
- [x] 2.1 Register card + OAuth complete page send the browser timezone
- [x] 2.2 Settings: datalist typeahead for timezone with client-side validation + inline error; strings ×5 catalogs
- [x] 2.3 Component tests: register payload includes timezone; invalid settings value blocked

## 3. Verification
- [ ] 3.1 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; CI green; archive
