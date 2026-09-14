"use client";

import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { withSettingsParam, type SettingsTab } from "@/lib/settings-dialog-url";

/**
 * next-intl `Link` href that opens the settings dialog over the current page,
 * keeping the page's other query parameters (catalog filters etc.).
 */
export function useSettingsHref(tab: SettingsTab = "profile") {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return { pathname, query: withSettingsParam(searchParams, tab) };
}
