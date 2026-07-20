import {
  Role,
  type PlayerProfileResponse,
  type ProProfileResponse,
} from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PlayerProfileEditor } from "@/components/players/player-profile-editor";
import { ProProfileEditor } from "@/components/pros/pro-profile-editor";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("proProfileTitle") };
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: "/login?next=/dashboard/profile",
      locale: await getLocale(),
    });
    return null;
  }

  if (user.role === Role.Amateur) {
    const profile = await serverApiGet<PlayerProfileResponse>("/players/me");
    if (!profile) {
      redirect({ href: "/dashboard", locale: await getLocale() });
      return null;
    }
    const t = await getTranslations("playerProfile");
    return (
      <div className="mx-auto w-full max-w-[720px] pb-16">
        <header className="pb-2 pt-1">
          <h1 className="text-[28px] font-bold text-text">🏓 {t("title")}</h1>
          <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
        </header>
        <PlayerProfileEditor initialProfile={profile} initialUser={user} />
      </div>
    );
  }

  if (user.role !== Role.Professional) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const profile = await serverApiGet<ProProfileResponse>("/pros/me/profile");
  if (!profile) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const t = await getTranslations("proProfile");

  return (
    <div className="mx-auto w-full max-w-[720px] pb-16">
      <header className="pb-2 pt-1">
        <h1 className="text-[28px] font-bold text-text">🏆 {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>
      <ProProfileEditor
        initialProfile={profile}
        emailVerified={user.emailVerified}
      />
    </div>
  );
}
