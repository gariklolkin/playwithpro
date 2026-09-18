/** Search parameter that opens the account settings dialog on any page. */
export const SETTINGS_PARAM = "settings";

export const SETTINGS_TABS = [
  "profile",
  "security",
  "notifications",
  "account",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Unknown or empty values fall back to the Profile tab. */
export function normalizeSettingsTab(value: string | null): SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(value ?? "")
    ? (value as SettingsTab)
    : "profile";
}

/** Query of the current page with the `settings` key set (or removed when null). */
export function withSettingsParam(
  searchParams: URLSearchParams,
  tab: SettingsTab | null,
): Record<string, string> {
  const next = new URLSearchParams(searchParams);
  if (tab) {
    next.set(SETTINGS_PARAM, tab);
  } else {
    next.delete(SETTINGS_PARAM);
  }
  return Object.fromEntries(next.entries());
}
