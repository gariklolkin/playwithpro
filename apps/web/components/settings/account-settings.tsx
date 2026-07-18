"use client";

import {
  SUPPORTED_LOCALES,
  type Locale,
  type MeResponse,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { usePathname, useRouter } from "@/i18n/navigation";
import { API_URL, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GoogleLogo } from "@/components/ui/google-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimezoneSelect } from "@/components/ui/timezone-select";

function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-card bg-bg p-6 shadow-card">
      <h2 className="mb-4 text-[13px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function AccountSettings({ initialUser }: { initialUser: MeResponse }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const pathname = usePathname();
  const activeLocale = useLocale();
  const [user, setUser] = useState(initialUser);

  const timezones = useMemo<string[]>(
    () => Intl.supportedValuesOf("timeZone"),
    [],
  );

  // Profile form
  const [displayName, setDisplayName] = useState(user.displayName);
  const [locale, setLocale] = useState(user.locale);
  const [timezone, setTimezone] = useState(user.timezone);
  const [profileStatus, setProfileStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "invalidTimezone"
  >("idle");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "saving" | "changed" | "wrong" | "mismatch"
  >("idle");

  // Google linking
  const [googleStatus, setGoogleStatus] = useState<
    "idle" | "unlinking" | "unlinked"
  >("idle");

  async function handleProfileSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!timezones.includes(timezone)) {
      setProfileStatus("invalidTimezone");
      return;
    }
    setProfileStatus("saving");
    const response = await apiFetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName, locale, timezone }),
    });
    if (!response.ok) {
      setProfileStatus("error");
      return;
    }
    setUser((await response.json()) as MeResponse);
    setProfileStatus("saved");
    if (locale !== activeLocale) {
      router.replace(pathname, { locale: locale as Locale });
    } else {
      router.refresh();
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus("mismatch");
      return;
    }
    setPasswordStatus("saving");
    const response = await apiFetch("/users/me/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!response.ok) {
      setPasswordStatus("wrong");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordStatus("changed");
  }

  async function handleUnlink() {
    setGoogleStatus("unlinking");
    const response = await apiFetch("/users/me/oauth/google", {
      method: "DELETE",
    });
    if (response.ok) {
      setUser((await response.json()) as MeResponse);
      setGoogleStatus("unlinked");
    } else {
      setGoogleStatus("idle");
    }
  }

  return (
    <>
      <SettingsCard title={t("profile.title")}>
        <form onSubmit={handleProfileSubmit} noValidate>
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
            <Button type="submit" disabled={profileStatus === "saving"}>
              {profileStatus === "saving"
                ? t("profile.saving")
                : t("profile.save")}
            </Button>
            {profileStatus === "saved" ? (
              <span className="text-[13px] text-text-secondary">
                {t("profile.saved")}
              </span>
            ) : null}
            {profileStatus === "error" ? (
              <span className="text-[13px] text-[#E03E3E]">
                {t("profile.error")}
              </span>
            ) : null}
            {profileStatus === "invalidTimezone" ? (
              <span className="text-[13px] text-[#E03E3E]">
                {t("profile.timezoneInvalid")}
              </span>
            ) : null}
          </div>
        </form>
      </SettingsCard>

      <SettingsCard title={t("password.title")}>
        {user.hasPassword ? (
          <form onSubmit={handlePasswordSubmit} noValidate>
            <Label htmlFor="settings-current-password">
              {t("password.current")}
            </Label>
            <Input
              id="settings-current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mb-3"
            />
            <Label htmlFor="settings-new-password">{t("password.new")}</Label>
            <Input
              id="settings-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder={t("password.newPlaceholder")}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mb-3"
            />
            <Label htmlFor="settings-confirm-password">
              {t("password.confirm")}
            </Label>
            <Input
              id="settings-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder={t("password.newPlaceholder")}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mb-3"
            />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={passwordStatus === "saving"}>
                {passwordStatus === "saving"
                  ? t("password.submitting")
                  : t("password.submit")}
              </Button>
              {passwordStatus === "changed" ? (
                <span className="text-[13px] text-text-secondary">
                  {t("password.changed")}
                </span>
              ) : null}
              {passwordStatus === "wrong" ? (
                <span className="text-[13px] text-[#E03E3E]">
                  {t("password.wrongCurrent")}
                </span>
              ) : null}
              {passwordStatus === "mismatch" ? (
                <span className="text-[13px] text-[#E03E3E]">
                  {t("password.mismatch")}
                </span>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="text-sm text-text-secondary">
            {t("password.noPassword")}
          </p>
        )}
      </SettingsCard>

      <SettingsCard title={t("google.title")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-tag bg-[#F1F0EF] px-2 py-0.5 text-[12.5px] font-medium text-[#5A5A58]">
            <GoogleLogo className="h-3.5 w-3.5" />{" "}
            {user.googleLinked ? t("google.linked") : t("google.notLinked")}
          </span>
          {user.googleLinked ? (
            <div className="flex items-center gap-3">
              {!user.hasPassword ? (
                <span className="text-[13px] text-text-tertiary">
                  {t("google.needPassword")}
                </span>
              ) : null}
              <Button
                variant="ghost"
                disabled={!user.hasPassword || googleStatus === "unlinking"}
                onClick={() => void handleUnlink()}
              >
                {googleStatus === "unlinking"
                  ? t("google.unlinking")
                  : t("google.unlink")}
              </Button>
            </div>
          ) : (
            <a
              href={`${API_URL}/auth/google`}
              className="rounded-lg border border-border-strong px-3.5 py-[9px] text-sm font-medium text-text no-underline transition-colors hover:bg-bg-hover"
            >
              {t("google.link")}
            </a>
          )}
        </div>
        {googleStatus === "unlinked" ? (
          <p className="mt-3 text-[13px] text-text-secondary">
            {t("google.unlinked")}
          </p>
        ) : null}
      </SettingsCard>
    </>
  );
}
