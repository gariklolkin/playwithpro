import { Role, type SessionListResponse } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { SessionsList } from "@/components/sessions/sessions-list";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("sessionsTitle") };
}

export default async function SessionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: "/login?next=/dashboard/sessions",
      locale: await getLocale(),
    });
    return null;
  }
  if (user.role === Role.Admin) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const sessions = await serverApiGet<SessionListResponse>("/sessions");
  const t = await getTranslations("sessions");
  const isCoach = user.role === Role.Professional;

  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-2 pt-1">
        <div>
          <h1 className="text-[28px] font-bold text-text">🗓️ {t("title")}</h1>
          <p className="mt-1 text-text-secondary">
            {isCoach ? t("subtitleCoach") : t("subtitlePlayer")}
          </p>
        </div>
        {!isCoach ? (
          <Link
            href="/coaches"
            className="rounded-lg bg-text px-3.5 py-[9px] text-sm font-medium text-white hover:bg-black"
          >
            🔍 {t("findCoachCta")}
          </Link>
        ) : null}
      </header>
      <SessionsList
        upcoming={sessions?.upcoming ?? []}
        past={sessions?.past ?? []}
        isCoach={isCoach}
      />
    </div>
  );
}
