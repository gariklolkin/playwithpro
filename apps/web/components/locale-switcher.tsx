"use client";

import { SUPPORTED_LOCALES, type Locale } from "@playwithpro/shared";
import { ChevronDown } from "lucide-react";
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
    // Compact "globe + code" trigger per the design mockup; the transparent
    // native select on top keeps keyboard/screen-reader behavior and shows
    // full language names in the dropdown.
    <span className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] text-text-secondary focus-within:border-border-strong">
      <span aria-hidden>🌐</span>
      <span className="font-medium uppercase">{locale}</span>
      <ChevronDown aria-hidden className="h-3.5 w-3.5" />
      <select
        aria-label={t("language")}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        value={locale}
        onChange={handleChange}
      >
        {SUPPORTED_LOCALES.map((supported) => (
          <option key={supported} value={supported}>
            {LOCALE_LABELS[supported]}
          </option>
        ))}
      </select>
    </span>
  );
}
