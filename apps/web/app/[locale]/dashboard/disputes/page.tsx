import { Role, type AdminDisputeListResponse } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminDisputes } from "@/components/admin/admin-disputes";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("disputesTitle") };
}

export default async function DisputesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: "/login?next=/dashboard/disputes",
      locale: await getLocale(),
    });
    return null;
  }
  if (user.role !== Role.Admin) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const disputes =
    await serverApiGet<AdminDisputeListResponse>("/admin/disputes");
  const t = await getTranslations("adminDisputes");

  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <header className="pb-2 pt-1">
        <h1 className="text-[28px] font-bold text-text">⚖️ {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>
      <AdminDisputes initial={disputes ?? { open: [], resolved: [] }} />
    </div>
  );
}
