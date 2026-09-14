import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/server-user";
import { normalizeSettingsTab } from "@/lib/settings-dialog-url";

/**
 * Legacy settings URL. Account settings now open as a dialog over any page
 * (`?settings=<tab>`), so old links, bookmarks and post-login returns land on
 * the dashboard with the dialog open. `?tab=security` picks the tab.
 */
export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [user, locale, { tab }] = await Promise.all([
    getCurrentUser(),
    getLocale(),
    searchParams,
  ]);
  if (!user) {
    redirect({ href: "/login?next=/settings/account", locale });
    return null;
  }

  redirect({
    href: {
      pathname: "/dashboard",
      query: { settings: normalizeSettingsTab(tab ?? null) },
    },
    locale,
  });
  return null;
}
