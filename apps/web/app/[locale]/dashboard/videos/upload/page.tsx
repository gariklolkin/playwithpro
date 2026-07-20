import { Role } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { VideoUploader } from "@/components/videos/video-uploader";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("videoUploadTitle") };
}

export default async function VideoUploadPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: "/login?next=/dashboard/videos/upload",
      locale: await getLocale(),
    });
    return null;
  }
  if (user.role !== Role.Amateur) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const t = await getTranslations("videos.upload");

  return (
    <div className="mx-auto w-full max-w-[720px] pb-16">
      <header className="pb-4 pt-1">
        <Link
          href="/dashboard/videos"
          className="text-sm text-text-secondary hover:text-text"
        >
          ← {t("backToLibrary")}
        </Link>
        <h1 className="mt-2 text-[28px] font-bold text-text">
          ⬆️ {t("title")}
        </h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>
      <VideoUploader />
    </div>
  );
}
