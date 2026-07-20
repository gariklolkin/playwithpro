import { Role, type VideoListResponse } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { VideosLibrary } from "@/components/videos/videos-library";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("videosTitle") };
}

export default async function VideosPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: "/login?next=/dashboard/videos",
      locale: await getLocale(),
    });
    return null;
  }
  if (user.role !== Role.Amateur) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const library = await serverApiGet<VideoListResponse>("/videos");
  const t = await getTranslations("videos");

  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-2 pt-1">
        <div>
          <h1 className="text-[28px] font-bold text-text">📹 {t("title")}</h1>
          <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
        </div>
        <Link
          href="/dashboard/videos/upload"
          className="rounded-lg bg-text px-3.5 py-[9px] text-sm font-medium text-white hover:bg-black"
        >
          ⬆️ {t("uploadCta")}
        </Link>
      </header>
      <VideosLibrary initialVideos={library?.videos ?? []} />
    </div>
  );
}
