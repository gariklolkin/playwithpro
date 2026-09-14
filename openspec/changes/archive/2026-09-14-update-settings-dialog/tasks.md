## 1. Dialog primitive

- [x] 1.1 Add the shadcn/ui-style `dialog` component in `apps/web` on Base UI (`@base-ui/react` was already a dependency, so `components/ui/dialog.tsx` was written by hand instead of running the CLI, which would also have touched `globals.css`)
- [x] 1.2 Restyle `components/ui/dialog.tsx` to project tokens (`bg-bg`, `border-border`, `shadow-card`, `rounded-card`, ink text; backdrop `bg-black/50`) and add a `fullScreenBelowSm` variant for the popup (inset-0, no radius, safe-area padding)
- [x] 1.3 Rewrite `components/settings/avatar-crop-dialog.tsx` on the Dialog primitive (controlled `open`, `Dialog.Title` for the accessible name, nested-dialog stacking); keep `onConfirm`/`onCancel` API and `crop-image.test.ts` untouched

## 2. Settings panels

- [x] 2.1 Split `components/settings/account-settings.tsx` into `ProfileSettingsPanel` (photo + profile cards) and `SecuritySettingsPanel` (password + connected accounts cards) in `components/settings/panels/`, sharing the `SettingsCard` wrapper; state and fetch calls unchanged
- [x] 2.2 In the profile save handler, preserve the current search string when switching locale: `router.replace({ pathname, query }, { locale })` so `?settings=profile` survives the re-render
- [x] 2.3 Update `app/__tests__/account-settings.test.tsx` for the panel split (mock `usePathname` as `/dashboard`, add `useSearchParams`) and assert the locale switch keeps the `settings` param

## 3. Dialog host and URL model

- [x] 3.1 Create `components/settings/settings-dialog.tsx`: `SettingsDialog({ user, tab, onClose })` — header (title + close button with Lucide `X`), 200px tab rail (emoji + label, active state like the dashboard sidebar), scrolling panel; ≥640px centered `max-w-[880px]` / `h-[min(720px,90vh)]`, <640px full-screen with a horizontal tab strip
- [x] 3.2 Create `components/settings/settings-dialog-host.tsx` (client): read `useSearchParams().get("settings")`, normalise to `profile` | `security`, render the dialog when present, close by `router.replace` to the same pathname with only the `settings` key removed
- [x] 3.3 Mount the host in `app/[locale]/layout.tsx` for signed-in users only (reuse the `getCurrentUser()` call from `Navbar` by lifting it to the layout and passing `user` down), wrapped in `<Suspense fallback={null}>`
- [x] 3.4 Turn `app/[locale]/settings/account/page.tsx` into a locale-preserving server redirect to `/dashboard?settings=<tab>` (`?tab=security` → `security`, else `profile`); keep the sign-in check so `middleware.test.ts` expectations stay valid
- [x] 3.5 New `app/__tests__/settings-dialog.test.tsx`: opens on `?settings=security` with the Security tab active, unknown value falls back to Profile, close calls `replace` with the param removed and other params kept, Escape closes

## 4. Entry points

- [x] 4.1 `components/user-menu.tsx`: "Settings" becomes a `Link` to `{ pathname: usePathname(), query: { settings: "profile" } }`; "Dashboard" item removed (owner decision, logo covers it; `nav.dashboard` dropped from all catalogs); "Log out" unchanged
- [x] 4.2 `components/dashboard/sidebar.tsx`: add optional `query` to `SidebarItem`; render query-only items as a `Link` to the current pathname with that query (no active highlight); `app/[locale]/dashboard/layout.tsx` passes `{ settings: "profile" }` for the amateur and professional settings items instead of `href: "/settings/account"`
- [x] 4.3 Grep for remaining `/settings/account` links in `apps/web` (auth flows, emails, `next=` builders) and switch any in-app link to the query form; leave `next=/settings/account` handling as is (covered by the redirect)

## 5. Copy and catalogs

- [x] 5.1 Add `settings.dialog.{title,close,tabs.profile,tabs.security}` to `messages/en.json` and translate into `fr`, `de`, `ru`, `zh`; `messages.test.ts` must pass
- [x] 5.2 Remove the now-unused page `header` copy (`settings.subtitle`) only if no other consumer remains; keep `meta.settingsTitle` (redirect page metadata) and note it for archive-time cleanup

## 6. Verification

- [x] 6.1 `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test` green locally
- [x] 6.2 Browser smoke via Tilt: open from user menu on `/coaches`, from the sidebar on `/dashboard/sessions`, reload with `?settings=security`, close via Escape/backdrop/button and confirm URL cleanup, change language inside the dialog, upload + crop + remove avatar (nested dialog focus return), `/settings/account?tab=security` redirect
- [x] 6.3 Mobile check at 375px (DevTools + one real phone): full-screen sheet, tab strip, crop dialog zoom/pan inside the nested popup — 375px emulation verified (full-screen sheet, tab strip, no horizontal scroll); real-phone touch check of the nested crop dialog still owner-pending
- [x] 6.4 Update `openspec/project.md` roadmap (add change 22 `update-settings-dialog`) and `design/DESIGN.md` §2 IA note that Settings is a dialog, not a section
