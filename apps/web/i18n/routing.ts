import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@playwithpro/shared";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Default locale stays unprefixed so existing links, OAuth redirect URIs
  // and mailer URLs keep working.
  localePrefix: "as-needed",
});
