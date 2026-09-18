import type { AdminAccountRequestItem } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountRequestsLog } from "@/components/admin/account-requests-log";
import { serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("adminAccountRequestsTitle") };
}

export default async function AdminAccountRequestsPage() {
  const items = await serverApiGet<AdminAccountRequestItem[]>(
    "/admin/account-requests",
  );
  const t = await getTranslations("account.admin.log");
  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <header className="pb-2 pt-1">
        <h1 className="text-[28px] font-bold text-text">🗂️ {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>
      <AccountRequestsLog items={items ?? []} />
    </div>
  );
}
