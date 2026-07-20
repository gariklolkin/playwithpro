"use client";

import {
  VideoStatus,
  type VideoListResponse,
  type VideoResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_BADGE: Record<VideoStatus, string> = {
  [VideoStatus.Uploading]: "bg-[#FAECC8] text-[#8A6C1B]",
  [VideoStatus.Processing]: "bg-[#D6E4F5] text-[#2A5FC7]",
  [VideoStatus.Ready]: "bg-[#DBEDDB] text-[#1C7A46]",
  [VideoStatus.Rejected]: "bg-[#FBE4E4] text-[#C4554D]",
};

const POLL_INTERVAL_MS = 5000;

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

export function VideosLibrary({
  initialVideos,
}: {
  initialVideos: VideoResponse[];
}) {
  const t = useTranslations("videos");
  const [videos, setVideos] = useState(initialVideos);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Uploads and processing finish server-side; poll while any are pending.
  const hasPending = videos.some(
    (video) =>
      video.status === VideoStatus.Uploading ||
      video.status === VideoStatus.Processing,
  );
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      void apiFetch("/videos").then(async (response) => {
        if (response.ok) {
          setVideos(((await response.json()) as VideoListResponse).videos);
        }
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending]);

  async function submitRename(video: VideoResponse) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title || title === video.title) return;
    const response = await apiFetch(`/videos/${video.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    if (response.ok) {
      const updated = (await response.json()) as VideoResponse;
      setVideos((current) =>
        current.map((item) => (item.id === video.id ? updated : item)),
      );
    }
  }

  async function deleteVideo(video: VideoResponse) {
    if (!window.confirm(t("deleteConfirm", { title: video.title }))) return;
    const response = await apiFetch(`/videos/${video.id}`, {
      method: "DELETE",
    });
    if (response.ok || response.status === 404) {
      setVideos((current) => current.filter((item) => item.id !== video.id));
    }
  }

  if (videos.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-border p-10 text-center">
        <div className="text-3xl">📹</div>
        <div className="mt-2 font-semibold text-text">{t("emptyTitle")}</div>
        <p className="mt-1 text-sm text-text-secondary">{t("emptySubtitle")}</p>
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {videos.map((video) => {
        const duration = formatDuration(video.durationSeconds);
        const size = formatSize(video.sizeBytes);
        const details = [
          duration,
          video.width && video.height ? `${video.width}×${video.height}` : null,
          video.fps ? `${Math.round(video.fps)} fps` : null,
          size,
          new Date(video.createdAt).toLocaleDateString(),
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <li
            key={video.id}
            className="rounded-card border border-border bg-bg p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                {renamingId === video.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitRename(video);
                    }}
                  >
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={() => void submitRename(video)}
                    />
                  </form>
                ) : video.status === VideoStatus.Ready ? (
                  <Link
                    href={`/dashboard/videos/${video.id}`}
                    className="truncate font-semibold text-text hover:underline"
                  >
                    {video.title}
                  </Link>
                ) : (
                  <span className="truncate font-semibold text-text">
                    {video.title}
                  </span>
                )}
                <div className="mt-1 text-[13px] text-text-secondary">
                  {details}
                </div>
                {video.status === VideoStatus.Rejected &&
                video.rejectionReason ? (
                  <p className="mt-1 text-[13px] text-[#C4554D]">
                    {t(`rejection.${video.rejectionReason}`)}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[video.status]}`}
                >
                  {t(`status.${video.status}`)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRenamingId(video.id);
                    setRenameValue(video.title);
                  }}
                >
                  {t("rename")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteVideo(video)}
                >
                  {t("delete")}
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
