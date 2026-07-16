"use client";

import { SUPPORTED_LOCALES, type MeResponse } from "@playwithpro/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GoogleLogo } from "@/components/ui/google-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  ru: "Русский",
  zh: "中文",
};

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
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "saving" | "changed" | "wrong"
  >("idle");

  // Google linking
  const [googleStatus, setGoogleStatus] = useState<
    "idle" | "unlinking" | "unlinked"
  >("idle");

  async function handleProfileSubmit(event: React.FormEvent) {
    event.preventDefault();
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
    router.refresh();
  }

  async function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
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
                    {LOCALE_LABELS[value] ?? value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="settings-timezone">{t("profile.timezone")}</Label>
              <select
                id="settings-timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="w-full rounded-lg border border-border-strong bg-bg px-3 py-[9px] text-sm text-text"
              >
                {timezones.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
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
