## Context

Account settings are a standalone page at `/settings/account` (`app/[locale]/settings/account/page.tsx`) rendering `AccountSettings`: four cards (photo, profile, password, connected Google account) in one scrolling column. It is reached from the user menu (`components/user-menu.tsx`), the dashboard sidebar (`app/[locale]/dashboard/layout.tsx` → `components/dashboard/sidebar.tsx`), the post-login `?next=/settings/account` return, and it is protected by `middleware.ts` (`PROTECTED_SEGMENTS`). The avatar crop step is a hand-rolled `position: fixed` overlay inside `AvatarCropDialog`. The web app has no dialog primitive yet; shadcn/ui is configured with the `base-nova` style, i.e. components are generated on top of **Base UI**, not Radix.

Constraints: next-intl locale-prefixed routing (`@/i18n/navigation` `Link`/`useRouter`/`usePathname`), no hard-coded strings, Notion-style tokens from `design/DESIGN.md`, the layout under `[locale]` is already dynamic (it reads the auth cookie), 5 catalogs kept in parity by `messages.test.ts`.

## Goals / Non-Goals

**Goals:**
- Settings open as a large tabbed dialog over whatever page the user is on, and closing returns them there with no navigation.
- The open dialog and its tab are encoded in the URL so reload, Back, redirects and shared links behave predictably.
- One settings surface: no duplicated standalone page to keep in sync.
- Correct keyboard/focus behavior including the nested crop dialog; full-screen presentation on phones.

**Non-Goals:**
- New settings content, changes to the API, changes to the user menu beyond how "Settings" behaves.
- Making the dialog work for signed-out visitors (the host is not mounted without a user).
- Next.js intercepting/parallel routes (see Decision 1).

## Decisions

### 1. URL model: search param on the current page, not an intercepting route

`?settings=profile|security` on any signed-in page opens the dialog on that tab; any other value is treated as `profile`. A client `SettingsDialogHost` mounted in `app/[locale]/layout.tsx` (only when `getCurrentUser()` returns a user) reads `useSearchParams()` and renders the dialog. Closing calls `router.replace(pathname)` with the param removed (replace, not `back()`, so a user who arrived via a direct link does not get bounced out of the app). Because `useSearchParams` in a layout-level client component needs a Suspense boundary, the host is wrapped in `<Suspense fallback={null}>`.

*Why not Next intercepting routes (`@modal/(.)settings/account`)?* They give the "page on hard load, modal on soft nav" pattern for free, but: the modal's `usePathname()` is the settings URL, not the underlying page, which breaks the in-dialog locale change (Decision 4); they need a parallel-slot `default.tsx` and have known quirks with soft navigation leaving the slot rendered; and they would keep two surfaces (page + modal) alive. The search-param model is fully under our control and works identically from the user menu, the sidebar and redirects.

### 2. `/settings/account` becomes a redirect, and the middleware guard stays

`app/[locale]/settings/account/page.tsx` server-redirects to `/dashboard?settings=<tab>` (`?tab=security` → `settings=security`, default `profile`), locale preserved via `@/i18n/navigation` `redirect`. The middleware still lists `/settings` as protected, so a signed-out visitor is sent to `/login?next=/settings/account` first and, after signing in, lands on the dashboard with the dialog open. Existing `next=` links and bookmarks therefore keep working without touching auth code. `meta.settingsTitle` stays in the catalogs for now (used by the redirect page's metadata is pointless; it is left in place to avoid a catalog churn and can be removed at archive time).

### 3. Dialog primitive and nesting

Add the shadcn/ui `dialog` component (Base UI `Dialog.Root/Trigger/Portal/Backdrop/Popup/Title/Description/Close`) via `pnpm dlx shadcn add dialog` inside `apps/web`, then restyle to the project tokens (`bg-bg`, `shadow-card`, `rounded-card`, ink text, 1px `border-border`). Base UI dialogs support nesting natively (the inner dialog stacks above and returns focus to the outer popup on close), so `AvatarCropDialog` is rewritten on the same primitive with `open` controlled by the uploader. This also removes the stacking bug the hand-rolled overlay would hit: the settings popup is centered with a transform, which turns it into a containing block for `position: fixed` descendants, so the old overlay would be clipped to the popup instead of covering the viewport.

Layout: desktop ≥640px — popup `max-w-[880px]`, height `min(720px, 90vh)`, two columns: a 200px tab rail (emoji + label, active state as in the dashboard sidebar) and a scrolling panel with the cards from `AccountSettings`; header row with the dialog title and a close button (Lucide `X`, allowed for system UI per DESIGN.md). Below 640px — the popup becomes a full-screen sheet, the rail becomes a horizontal tab strip under the header. Tabs: `profile` = photo + profile cards; `security` = password + connected accounts cards.

### 4. Locale change from inside the dialog

`AccountSettings` today does `router.replace(pathname, { locale })` after saving a different `locale`. With the host mounted in the layout, `usePathname()` is the underlying page, so the same call re-renders that page in the new locale; the host re-reads the (unchanged) search param and the dialog stays open on the same tab, now translated. The component is changed to preserve the current search string in that replace (`pathname + "?" + searchParams`), otherwise the dialog would close. No full reload.

### 5. Entry points

- `user-menu.tsx`: "Settings" becomes a `Link` to `{ pathname, query: { settings: "profile" } }` for the current pathname (next-intl `Link` accepts href objects); `Dashboard` and `Log out` unchanged.
- Sidebar: `SidebarItem` gains an optional `query`; the dashboard layout passes `{ settings: "profile" }` for the settings item without an `href`, and the sidebar renders it as a `Link` to the current pathname with that query. The active highlight is pathname-based and stays on the underlying page item, which is the desired reading ("you are still on My sessions").
- `AccountSettings` is split into `ProfileSettingsPanel` and `SecuritySettingsPanel` (same state hooks and fetch calls, just regrouped) so the dialog can render one tab at a time; both panels keep `initialUser` as the seed and the host passes the `MeResponse` from the layout.

### 6. Dialog keeps the page's data fresh

Saving the profile already calls `router.refresh()`; that re-renders the layout, so the navbar avatar/name update while the dialog is open. Avatar upload/remove does the same today. Nothing new needed.

## Risks / Trade-offs

- [`useSearchParams` in the layout opts the subtree into client-side rendering on static routes] → the locale layout is already dynamic (cookie read), and the host renders `null` when closed; the Suspense boundary contains the bailout.
- [Base UI is a new runtime dependency and shadcn's `base-nova` output may drift from our tokens] → restyle once in `components/ui/dialog.tsx`; no other Base UI components are introduced by this change.
- [Search param collides with pages that use their own query state (catalog filters)] → `settings` is namespaced enough; the host only reads that one key and the close handler removes only that key, preserving other params.
- [Full-screen sheet on phones with the crop dialog nested on top] → both are Base UI dialogs; verify on a real phone that the zoom slider and drag-to-pan still work inside the nested popup (touch events are not affected by the focus trap).
- [Deep-linked `?settings=` on a public page for a signed-out user] → the host is not mounted; the param is ignored. A signed-out `/settings/account` still goes through login first (middleware), so the intended path stays.
- [Tests mock `usePathname` as `/settings/account`] → update to a dashboard path and add `useSearchParams` to the mock; add a host test that opens on the param and closes by replacing the URL.

## Migration Plan

No data or API migration. Deploy the web image as usual; old bookmarks to `/settings/account` are redirected server-side. Rollback = redeploy the previous web image.

## Open Questions

- Whether "Interface language" should stay inside the dialog now that the navbar switcher already persists the locale for signed-in users. Kept for now (one place to see all account fields); can be dropped in a follow-up if it confuses testers.
