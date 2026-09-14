## Why

Account settings currently live on a standalone page (`/settings/account`) that pulls the user out of whatever they were doing — the dashboard, the coach catalog, a coach page — and the user menu has to carry a separate "Dashboard" entry just to get them back. Products with the same shape (claude.ai, Notion, Linear) open settings as a large tabbed dialog over the current screen: the context stays visible, closing returns exactly where the user was, and settings stop being a "place" in the navigation. The owner asked for this after reviewing the user menu on staging (2026-09-14).

## What Changes

- Account settings open in a **modal dialog over the current page** (desktop: centered dialog with a left tab rail; below 640px: full-screen sheet). Tabs: **Profile** (photo, display name, interface language, timezone) and **Security** (password, connected Google account). Existing forms are reused unchanged in behavior.
- The dialog is **URL-addressable** via a search param on any signed-in page (`?settings=profile` | `?settings=security`), so it survives reload, the browser Back button closes it, and links/redirects can open it directly.
- `/settings/account` **stops being a page**: it becomes a server redirect to `/dashboard?settings=profile` (preserving the tab when given). Existing deep links — the post-login `next=/settings/account` return and the OAuth-completion push — keep working and now land on the dashboard with the dialog open.
- **Entry points**: the user menu "Settings" item and the dashboard sidebar "Settings" item open the dialog in place instead of navigating. The user menu drops its "Dashboard" item (owner decision 2026-09-14): the menu is account-only, and the logo already leads signed-in users to the dashboard.
- The avatar crop dialog becomes a **nested dialog** of the settings dialog (proper focus management and stacking; the current hand-rolled fixed overlay would be clipped by the parent dialog's stacking context).
- Changing the interface language from inside the dialog re-renders the **underlying page** in the new locale with the dialog still open on the same tab.
- New UI strings (tab labels, dialog title, close) added to all five catalogs.

Not in scope: new settings (notifications, email change), moving pro/player profile editing into the dialog.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `user-accounts`: adds the "Account settings dialog" requirement (dialog surface, tabs, URL param, entry points, locale change behavior); modifies "Protected web areas" — `/settings/account` still requires sign-in but resolves to the dashboard with the settings dialog open rather than to a standalone page.

## Impact

- `apps/web/components/ui/dialog.tsx` — new shadcn/ui Dialog primitive (Base UI, per the project's `base-nova` style), first headless-UI dependency in the web app.
- `apps/web/components/settings/settings-dialog.tsx` (new), `account-settings.tsx` (split into tab panels), `avatar-crop-dialog.tsx` (nested Dialog), `avatar-uploader.tsx` (unchanged API).
- `apps/web/components/user-menu.tsx`, `apps/web/components/dashboard/sidebar.tsx`, `apps/web/app/[locale]/dashboard/layout.tsx` — entry points become "open dialog" links.
- `apps/web/app/[locale]/layout.tsx` — mounts the dialog host for signed-in users (reads the search param; needs a Suspense boundary).
- `apps/web/app/[locale]/settings/account/page.tsx` — becomes a redirect; `meta.settingsTitle` no longer used by a page.
- Tests: `account-settings.test.tsx`, `auth-forms.test.tsx` (OAuth completion target), `middleware.test.ts` (unchanged expectations), new `settings-dialog.test.tsx`; `messages.test.ts` enforces catalog parity for the new keys.
- No API or database changes.
