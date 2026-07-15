# Tasks: add-auth-and-accounts

## 1. Data layer & shared types
- [x] 1.1 Prisma models: User, OAuthAccount, RefreshToken, VerificationToken + Role enum; migration committed
- [x] 1.2 `packages/shared`: Role enum, auth DTO types (register/login/refresh payloads, `MeResponse`)
- [x] 1.3 `prisma/seed.ts` seeding admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; wire `pnpm db:seed`; extend `.env.example`

## 2. API — core auth
- [x] 2.1 Auth module: register (argon2id hash, verification email), login, logout, refresh with rotation + reuse detection; httpOnly cookies
- [x] 2.2 JwtAuthGuard + RolesGuard + `@CurrentUser()`/`@Roles()` decorators
- [x] 2.3 Mailer module (nodemailer, SMTP env); verification + reset email templates (English)
- [x] 2.4 Email verify + resend endpoints; password forgot/reset endpoints (hashed one-time tokens, TTL 1h)
- [x] 2.5 Throttling on register/login/forgot; generic errors (no user enumeration)
- [x] 2.6 Unit tests: token rotation & reuse revocation, guards, reset-token single use

## 3. API — Google OAuth
- [x] 3.1 Google strategy + `GET /auth/google` / callback with `state`; env vars documented
- [x] 3.2 Link-by-verified-email or create pending user; `POST /auth/oauth/complete` sets role for new OAuth users
- [x] 3.3 `DELETE /users/me/oauth/google` (unlink; forbidden if account has no password)
- [x] 3.4 Tests: new-user flow, existing-email link, unlink guard

## 4. API — account settings
- [x] 4.1 `GET /users/me`, `PATCH /users/me` (displayName, locale, timezone), `PATCH /users/me/password` (requires current password)
- [x] 4.2 Tests for settings endpoints

## 5. Web
- [x] 5.1 next-intl bootstrap with `en` catalog only; all new strings externalized
- [x] 5.2 Pages: /register (with role choice), /login (incl. "Continue with Google"), /verify-email, /forgot-password, /reset-password — shadcn/ui forms per design tokens
- [x] 5.3 OAuth completion page (role choice) for first-time Google users
- [x] 5.4 Auth session handling: middleware guarding /dashboard + /settings, silent refresh, logout
- [x] 5.5 Auth-aware navbar (avatar menu ~ design proposal); empty role-specific /dashboard shells
- [x] 5.6 /settings/account page (profile fields, password change, linked Google account)
- [x] 5.7 Component tests: register/login forms, middleware redirect

## 6. Verification & archive
- [x] 6.1 E2E happy paths (register→verify→login→me; google→complete→me; forgot→reset→login) against Tilt env; paste output in PR/commit message
- [x] 6.2 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; CI green
- [ ] 6.3 STOP — request owner review (Cowork) before archiving; archive only after approval
