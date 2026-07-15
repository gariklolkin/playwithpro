import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE } from "@playwithpro/shared";

// Single-locale bootstrap: full locale routing arrives with `add-i18n`.
export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  return {
    locale,
    messages: (
      (await import(`../messages/${locale}.json`)) as {
        default: Record<string, unknown>;
      }
    ).default,
  };
});
