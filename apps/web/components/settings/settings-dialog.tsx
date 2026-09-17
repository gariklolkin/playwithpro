"use client";

import type { MeResponse } from "@playwithpro/shared";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { NotificationsSettingsPanel } from "@/components/settings/panels/notifications-settings-panel";
import { ProfileSettingsPanel } from "@/components/settings/panels/profile-settings-panel";
import { SecuritySettingsPanel } from "@/components/settings/panels/security-settings-panel";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings-dialog-url";
import { cn } from "@/lib/utils";

const TAB_EMOJI: Record<SettingsTab, string> = {
  profile: "🏓",
  security: "🔒",
  notifications: "🔔",
};

/**
 * Account settings as a tabbed dialog over the current page. The open tab
 * is owned by the caller (it lives in the URL); the user object is seeded
 * from the server and updated from the panels' API responses.
 */
export function SettingsDialog({
  user: initialUser,
  tab,
  onTabChange,
  onClose,
}: {
  user: MeResponse;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
}) {
  const t = useTranslations("settings");
  const [user, setUser] = useState(initialUser);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        fullScreenBelowSm
        className="flex h-[min(720px,90vh)] max-w-[880px] flex-col overflow-hidden p-0"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <DialogTitle className="text-[17px]">⚙️ {t("title")}</DialogTitle>
            <DialogDescription className="mt-0.5">
              {t("subtitle")}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label={t("dialog.close")}
            className="-mr-2 -mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </DialogClose>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            role="tablist"
            aria-orientation="vertical"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-bg-secondary px-3 py-2 sm:w-[200px] sm:flex-col sm:border-b-0 sm:border-r sm:py-4"
          >
            {SETTINGS_TABS.map((key) => {
              const active = key === tab;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`settings-tab-${key}`}
                  aria-selected={active}
                  aria-controls={`settings-panel-${key}`}
                  onClick={() => onTabChange(key)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-black/5 hover:text-text",
                    active
                      ? "bg-black/5 font-medium text-text"
                      : "text-text-secondary",
                  )}
                >
                  <span aria-hidden>{TAB_EMOJI[key]}</span>
                  {t(`dialog.tabs.${key}`)}
                </button>
              );
            })}
          </nav>

          <div
            role="tabpanel"
            id={`settings-panel-${tab}`}
            aria-labelledby={`settings-tab-${tab}`}
            className="min-h-0 flex-1 overflow-y-auto bg-bg-secondary/40 p-4 sm:p-6"
          >
            {tab === "security" ? (
              <SecuritySettingsPanel user={user} onUserChange={setUser} />
            ) : tab === "notifications" ? (
              <NotificationsSettingsPanel />
            ) : (
              <ProfileSettingsPanel user={user} onUserChange={setUser} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
