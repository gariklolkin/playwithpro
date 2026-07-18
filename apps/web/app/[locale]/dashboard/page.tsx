import { Role } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { VerifyEmailBanner } from "@/components/dashboard/verify-email-banner";
import { getCurrentUser } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("dashboardTitle") };
}

const SECTIONS: Record<Role, string> = {
  [Role.Amateur]: "amateur",
  [Role.Professional]: "professional",
  [Role.Admin]: "admin",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login?next=/dashboard", locale: await getLocale() });
    return null;
  }

  const t = await getTranslations("dashboard");
  const section = SECTIONS[user.role];

  return (
    <>
      {!user.emailVerified ? <VerifyEmailBanner email={user.email} /> : null}
      <h1 className="text-[28px] font-bold text-text">
        {t(`${section}.title`)}
      </h1>
      <p className="mt-1 text-text-secondary">
        {t("greeting", { name: user.displayName })}
      </p>
      <div className="mt-8 rounded-card border border-border p-10 text-center">
        <div className="text-3xl">🏓</div>
        <div className="mt-2 font-semibold text-text">{t("emptyTitle")}</div>
        <p className="mt-1 text-sm text-text-secondary">
          {t(`${section}.empty`)}
        </p>
      </div>
    </>
  );
}
