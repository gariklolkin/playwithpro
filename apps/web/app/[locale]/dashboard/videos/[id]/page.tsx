import { Role, type VideoResponse } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { VideoPlayer } from "@/components/videos/video-player";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("videosTitle") };
}

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;
  const video = await serverApiGet<VideoResponse>(`/videos/${id}`);
  if (!video) {
    redirect({ href: "/dashboard/videos", locale: await getLocale() });
    return null;
  }

  const t = await getTranslations("videos");
  const details = [
    video.durationSeconds !== null
      ? `${Math.floor(video.durationSeconds / 60)}:${String(video.durationSeconds % 60).padStart(2, "0")}`
      : null,
    video.width && video.height ? `${video.width}×${video.height}` : null,
    video.fps ? `${Math.round(video.fps)} fps` : null,
    video.codec,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <header className="pb-4 pt-1">
        <Link
          href="/dashboard/videos"
          className="text-sm text-text-secondary hover:text-text"
        >
          ← {t("upload.backToLibrary")}
        </Link>
        <h1 className="mt-2 truncate text-[28px] font-bold text-text">
          {video.title}
        </h1>
        {details ? (
          <p className="mt-1 text-sm text-text-secondary">{details}</p>
        ) : null}
      </header>
      <VideoPlayer video={video} />
    </div>
  );
}
