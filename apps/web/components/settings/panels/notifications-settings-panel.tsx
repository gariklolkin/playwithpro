"use client";

import type { NotificationPreferencesResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/settings/settings-card";
import { apiFetch } from "@/lib/api";

type Category = keyof NotificationPreferencesResponse;

const CATEGORIES: Category[] = [
  "emailReminders",
  "emailClipChanges",
  "emailReviews",
];

/**
 * Notifications tab: the three optional email categories, saved on change.
 * Transactional mail (receipts, confirmation prompts, payouts, disputes,
 * cancellations) is not switchable and says so.
 */
export function NotificationsSettingsPanel() {
  const t = useTranslations("settings.notifications");
  const [prefs, setPrefs] = useState<NotificationPreferencesResponse | null>(
    null,
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/users/me/notifications").then(async (response) => {
      if (!response.ok || cancelled) return;
      setPrefs((await response.json()) as NotificationPreferencesResponse);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(category: Category, value: boolean) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [category]: value });
    setStatus("saving");
    const response = await apiFetch("/users/me/notifications", {
      method: "PATCH",
      body: JSON.stringify({ [category]: value }),
    });
    if (!response.ok) {
      setPrefs(previous);
      setStatus("error");
      return;
    }
    setPrefs((await response.json()) as NotificationPreferencesResponse);
    setStatus("saved");
  }

  return (
    <SettingsCard title={t("title")}>
      <p className="mb-4 text-[13px] text-text-secondary">{t("subtitle")}</p>
      {prefs === null ? (
        <div className="py-4 text-center text-sm text-text-tertiary">…</div>
      ) : (
        <ul className="space-y-3">
          {CATEGORIES.map((category) => (
            <li key={category} className="flex items-start gap-3">
              <input
                id={`notifications-${category}`}
                type="checkbox"
                checked={prefs[category]}
                disabled={status === "saving"}
                onChange={(event) =>
                  void toggle(category, event.target.checked)
                }
                className="mt-1 h-4 w-4 accent-[#2E7DE1]"
              />
              <label
                htmlFor={`notifications-${category}`}
                className="cursor-pointer"
              >
                <div className="text-sm font-medium text-text">
                  {t(`categories.${category}.label`)}
                </div>
                <div className="text-[13px] text-text-secondary">
                  {t(`categories.${category}.hint`)}
                </div>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 rounded-md bg-bg-secondary p-3 text-[12px] leading-snug text-text-secondary">
        {t("transactionalNote")}
      </p>
      <div className="mt-2 min-h-[18px] text-[13px]">
        {status === "saved" ? (
          <span className="text-text-secondary">{t("saved")}</span>
        ) : status === "error" ? (
          <span className="text-[#E03E3E]">{t("error")}</span>
        ) : null}
      </div>
    </SettingsCard>
  );
}
