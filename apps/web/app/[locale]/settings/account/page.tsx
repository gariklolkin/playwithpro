import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { AccountSettings } from "@/components/settings/account-settings";
import { getCurrentUser } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("settingsTitle") };
}

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: "/login?next=/settings/account",
      locale: await getLocale(),
    });
    return null;
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
