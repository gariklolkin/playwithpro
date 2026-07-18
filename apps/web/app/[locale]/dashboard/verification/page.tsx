import { Role, type AdminVerificationItem } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { VerificationQueue } from "@/components/admin/verification-queue";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("verificationQueueTitle") };
}

export default async function VerificationQueuePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: "/login?next=/dashboard/verification",
      locale: await getLocale(),
    });
    return null;
  }
  if (user.role !== Role.Admin) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const items =
    (await serverApiGet<AdminVerificationItem[]>(
      "/admin/verification-requests",
    )) ?? [];

  const t = await getTranslations("adminVerification");

  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <header className="pb-2 pt-1">
        <h1 className="text-[28px] font-bold text-text">✅ {t("title")}</h1>
      </header>
      <VerificationQueue initialItems={items} />
    </div>
  );
}
