"use client";

import { SUPPORTED_LOCALES, type Locale } from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";

export function LocaleSwitcher({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as Locale;
    if (isAuthenticated) {
      // Fire-and-forget: the cookie/URL already carry the choice.
      void apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ locale: nextLocale }),
      }).catch(() => undefined);
    }
    const query = window.location.search;
    startTransition(() => {
      router.replace(`${pathname}${query}`, { locale: nextLocale });
    });
  }

  return (
    <select
      aria-label={t("language")}
      className="rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] text-text-secondary"
      value={locale}
      onChange={handleChange}
    >
      {SUPPORTED_LOCALES.map((supported) => (
        <option key={supported} value={supported}>
          {LOCALE_LABELS[supported]}
        </option>
      ))}
    </select>
  );
}
