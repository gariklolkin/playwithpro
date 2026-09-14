"use client";

import type { MeResponse } from "@playwithpro/shared";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import {
  SETTINGS_PARAM,
  normalizeSettingsTab,
  withSettingsParam,
  type SettingsTab,
} from "@/lib/settings-dialog-url";

/**
 * Mounted once in the locale layout for signed-in users. Opens the settings
 * dialog whenever the current URL carries `?settings=<tab>`; tab changes and
 * closing rewrite only that parameter (history replace, no scroll reset), so
 * the page underneath stays put and a direct link never bounces the user out.
 */
export function SettingsDialogHost({ user }: { user: MeResponse }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = searchParams.get(SETTINGS_PARAM);
  if (raw === null) {
    return null;
  }

  function replaceParam(tab: SettingsTab | null) {
    router.replace(
      { pathname, query: withSettingsParam(searchParams, tab) },
      { scroll: false },
    );
  }

  return (
    <SettingsDialog
      user={user}
      tab={normalizeSettingsTab(raw)}
      onTabChange={replaceParam}
      onClose={() => replaceParam(null)}
    />
  );
}
