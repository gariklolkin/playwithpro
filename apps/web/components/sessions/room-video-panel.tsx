"use client";

import type { VideoUrlResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * The attached video next to the call in video-analysis rooms. Plays over a
 * short-lived pre-signed URL; the API admits both the owner and the session
 * coach.
 */
export function RoomVideoPanel({
  videoId,
  videoTitle,
}: {
  videoId: string;
  videoTitle: string | null;
}) {
  const t = useTranslations("sessions.room");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiFetch(`/videos/${videoId}/playback-url`).then(
      async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setFailed(true);
          return;
        }
        setPlaybackUrl(((await response.json()) as VideoUrlResponse).url);
      },
      () => setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
        📹{" "}
        <span className="truncate">{videoTitle ?? t("videoPanelTitle")}</span>
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-black">
        {failed ? (
          <div className="flex h-64 items-center justify-center text-sm text-white">
            {t("videoLoadFailed")}
          </div>
        ) : playbackUrl ? (
          <video
            src={playbackUrl}
            controls
            playsInline
            className="max-h-[520px] w-full"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-white/70">
            {t("videoLoading")}
          </div>
        )}
      </div>
    </div>
  );
}
