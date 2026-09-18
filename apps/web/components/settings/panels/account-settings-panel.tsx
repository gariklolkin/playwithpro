"use client";

import type { MeResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { DeleteAccountCard } from "@/components/account/delete-account-card";
import { ExportCard } from "@/components/account/export-card";
import { SettingsCard } from "@/components/settings/settings-card";

/** Account tab: the data-rights actions — export and deletion. */
export function AccountSettingsPanel({ user }: { user: MeResponse }) {
  const t = useTranslations("account");
  return (
    <div className="flex flex-col gap-6">
      <SettingsCard title={t("export.title")}>
        <ExportCard />
      </SettingsCard>
      <SettingsCard title={t("delete.title")}>
        <DeleteAccountCard user={user} />
      </SettingsCard>
    </div>
  );
}
