import { Role, type CoachAvailabilityResponse } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AvailabilityEditor } from "@/components/availability/availability-editor";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("availabilityTitle") };
}

export default async function AvailabilityPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: "/login?next=/dashboard/availability",
      locale: await getLocale(),
    });
    return null;
  }
  if (user.role !== Role.Professional) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const availability = await serverApiGet<CoachAvailabilityResponse>(
    "/pros/me/availability",
  );
  if (!availability) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const t = await getTranslations("availability");

  return (
    <div className="mx-auto w-full max-w-[880px] pb-16">
      <header className="pb-2 pt-1">
        <h1 className="text-[28px] font-bold text-text">🗓️ {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>
      <AvailabilityEditor initialData={availability} />
    </div>
  );
}
