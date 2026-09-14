"use client";

import {
  SUPPORTED_LOCALES,
  type Locale,
  type MeResponse,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimezoneSelect } from "@/components/ui/timezone-select";

/** Profile tab: photo, display name, interface language, timezone. */
export function ProfileSettingsPanel({
  user,
  onUserChange,
}: {
  user: MeResponse;
  onUserChange: (user: MeResponse) => void;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeLocale = useLocale();

  // Chrome's list omits plain "UTC", which is the signup default for accounts
  // created without a browser timezone; without it such users could never save.
  const timezones = useMemo<string[]>(() => {
    const supported = Intl.supportedValuesOf("timeZone");
    return supported.includes("UTC") ? supported : ["UTC", ...supported];
  }, []);

  const [displayName, setDisplayName] = useState(user.displayName);
  const [locale, setLocale] = useState(user.locale);
  const [timezone, setTimezone] = useState(user.timezone);
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "invalidTimezone"
  >("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!timezones.includes(timezone)) {
      setStatus("invalidTimezone");
      return;
    }
    setStatus("saving");
    const response = await apiFetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName, locale, timezone }),
    });
    if (!response.ok) {
      setStatus("error");
      return;
    }
    onUserChange((await response.json()) as MeResponse);
    setStatus("saved");
    if (locale !== activeLocale) {
      // Re-render the page underneath in the new locale. The search string
      // is preserved so an open settings dialog (`?settings=…`) stays open.
      router.replace(
        { pathname, query: Object.fromEntries(searchParams.entries()) },
        { locale: locale as Locale },
      );
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard title={t("avatar.title")}>
        <AvatarUploader
          user={user}
          onUserChange={(next) => {
            onUserChange(next);
            router.refresh();
          }}
        />
      </SettingsCard>

      <SettingsCard title={t("profile.title")}>
        <form onSubmit={handleSubmit} noValidate>
          <Label htmlFor="settings-name">{t("profile.displayName")}</Label>
          <Input
            id="settings-name"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mb-3"
          />
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="settings-locale">{t("profile.locale")}</Label>
              <select
                id="settings-locale"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                className="w-full rounded-lg border border-border-strong bg-bg px-3 py-[9px] text-sm text-text"
              >
                {SUPPORTED_LOCALES.map((value) => (
                  <option key={value} value={value}>
                    {LOCALE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="settings-timezone">{t("profile.timezone")}</Label>
              <TimezoneSelect
                id="settings-timezone"
                value={timezone}
                options={timezones}
                onChange={setTimezone}
                placeholder="Europe/Berlin"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={status === "saving"}>
              {status === "saving" ? t("profile.saving") : t("profile.save")}
            </Button>
            {status === "saved" ? (
              <span className="text-[13px] text-text-secondary">
                {t("profile.saved")}
              </span>
            ) : null}
            {status === "error" ? (
              <span className="text-[13px] text-[#E03E3E]">
                {t("profile.error")}
              </span>
            ) : null}
            {status === "invalidTimezone" ? (
              <span className="text-[13px] text-[#E03E3E]">
                {t("profile.timezoneInvalid")}
              </span>
            ) : null}
          </div>
        </form>
      </SettingsCard>
    </div>
  );
}
