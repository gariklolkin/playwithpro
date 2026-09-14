"use client";

import type { MeResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";
import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { GoogleLogo } from "@/components/ui/google-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Security tab: password change and the connected Google account. */
export function SecuritySettingsPanel({
  user,
  onUserChange,
}: {
  user: MeResponse;
  onUserChange: (user: MeResponse) => void;
}) {
  const t = useTranslations("settings");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "saving" | "changed" | "wrong" | "mismatch"
  >("idle");

  const [googleStatus, setGoogleStatus] = useState<
    "idle" | "unlinking" | "unlinked"
  >("idle");

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
      onUserChange((await response.json()) as MeResponse);
      setGoogleStatus("unlinked");
    } else {
      setGoogleStatus("idle");
    }
  }

  return (
    <div className="flex flex-col gap-6">
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
    </div>
  );
}
