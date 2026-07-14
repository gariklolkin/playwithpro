# Tasks: add-auth-and-accounts

## 1. Data layer & shared types
- [ ] 1.1 Prisma models: User, OAuthAccount, RefreshToken, VerificationToken + Role enum; migration committed
- [ ] 1.2 `packages/shared`: Role enum, auth DTO types (register/login/refresh payloads, `MeResponse`)
- [ ] 1.3 `prisma/seed.ts` seeding admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; wire `pnpm db:seed`; extend `.env.example`

## 2. API — core auth
- [ ] 2.1 Auth module: register (argon2id hash, verification email), login, logout, refresh with rotation + reuse detection; httpOnly cookies
- [ ] 2.2 JwtAuthGuard + RolesGuard + `@CurrentUser()`/`@Roles()` decorators
- [ ] 2.3 Mailer module (nodemailer, SMTP env); verification + reset email templates (English)
- [ ] 2.4 Email verify + resend endpoints; password forgot/reset endpoints (hashed one-time tokens, TTL 1h)
- [ ] 2.5 Throttling on register/login/forgot; generic errors (no user enumeration)
- [ ] 2.6 Unit tests: token rotation & reuse revocation, guards, reset-token single use

## 3. API — Google OAuth
- [ ] 3.1 Google strategy + `GET /auth/google` / callback with `state`; env vars documented
- [ ] 3.2 Link-by-verified-email or create pending user; `POST /auth/oauth/complete` sets role for new OAuth users
- [ ] 3.3 `DELETE /users/me/oauth/google` (unlink; forbidden if account has no password)
- [ ] 3.4 Tests: new-user flow, existing-email link, unlink guard

## 4. API — account settings
- [ ] 4.1 `GET /users/me`, `PATCH /users/me` (displayName, locale, timezone), `PATCH /users/me/password` (requires current password)
- [ ] 4.2 Tests for settings endpoints

## 5. Web
- [ ] 5.1 next-intl bootstrap with `en` catalog only; all new strings externalized
- [ ] 5.2 Pages: /register (with role choice), /login (incl. "Continue with Google"), /verify-email, /forgot-password, /reset-password — shadcn/ui forms per design tokens
- [ ] 5.3 OAuth completion page (role choice) for first-time Google users
- [ ] 5.4 Auth session handling: middleware guarding /dashboard + /settings, silent refresh, logout
- [ ] 5.5 Auth-aware navbar (avatar menu ~ design proposal); empty role-specific /dashboard shells
- [ ] 5.6 /settings/account page (profile fields, password change, linked Google account)
- [ ] 5.7 Component tests: register/login forms, middleware redirect

## 6. Verification & archive
- [ ] 6.1 E2E happy paths (register→verify→login→me; google→complete→me; forgot→reset→login) against Tilt env; paste output in PR/commit message
- [ ] 6.2 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; CI green
- [ ] 6.3 STOP — request owner review (Cowork) before archiving; archive only after approval
