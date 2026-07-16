import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountSettings } from "@/components/settings/account-settings";
import { getCurrentUser } from "@/lib/server-user";

export const metadata: Metadata = { title: "Account settings — PlayWithPro" };

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/settings/account");
  }

  const t = await getTranslations("settings");

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-16">
      <header className="pb-2 pt-9">
        <h1 className="text-[28px] font-bold text-text">⚙️ {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>
      <AccountSettings initialUser={user} />
    </div>
  );
}
