"use client";

import type { VideoResponse, VideoUrlResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Plays the browser-safe rendition over a short-lived pre-signed URL
 * (storage serves Range requests, so seeking works), and offers the
 * untouched original for download — that is the file a coach scrubs
 * frame by frame.
 */
export function VideoPlayer({ video }: { video: VideoResponse }) {
  const t = useTranslations("videos.player");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiFetch(`/videos/${video.id}/playback-url`).then(
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
  }, [video.id]);

  async function downloadOriginal() {
    setDownloading(true);
    try {
      const response = await apiFetch(`/videos/${video.id}/download-url`);
      if (response.ok) {
        const { url } = (await response.json()) as VideoUrlResponse;
        window.location.assign(url);
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <div className="overflow-hidden rounded-card border border-border bg-black">
        {failed ? (
          <div className="flex h-64 items-center justify-center text-sm text-white">
            {t("loadFailed")}
          </div>
        ) : playbackUrl ? (
          <video
            src={playbackUrl}
            controls
            playsInline
            className="max-h-[70vh] w-full"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-white/70">
            {t("loading")}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">{t("downloadHint")}</p>
        <Button
          variant="ghost"
          onClick={() => void downloadOriginal()}
          disabled={downloading}
        >
          ⬇️ {t("downloadOriginal")}
        </Button>
      </div>
    </div>
  );
}
