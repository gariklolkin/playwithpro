"use client";

import type { VideoUrlResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useSyncedPlayback } from "@/lib/use-synced-playback";

/**
 * The attached video next to the call in video-analysis rooms. Plays over a
 * short-lived pre-signed URL; the API admits both the owner and the session
 * coach. Playback state is shared between the parties over the sync channel,
 * with a per-user toggle to detach and scrub privately.
 */
export function RoomVideoPanel({
  sessionId,
  videoId,
  videoTitle,
}: {
  sessionId: string;
  videoId: string;
  videoTitle: string | null;
}) {
  const t = useTranslations("sessions.room");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sync = useSyncedPlayback(sessionId, videoRef);

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
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text">
          📹{" "}
          <span className="truncate">{videoTitle ?? t("videoPanelTitle")}</span>
        </div>
        <button
          type="button"
          aria-pressed={sync.synced}
          onClick={() => sync.setSynced(!sync.synced)}
          className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            sync.synced
              ? "border-border bg-bg-secondary text-text"
              : "border-border text-text-tertiary hover:text-text"
          }`}
          title={sync.synced ? t("sync.onHint") : t("sync.offHint")}
        >
          {sync.synced ? `🔄 ${t("sync.on")}` : t("sync.off")}
        </button>
      </div>
      <div className="relative overflow-hidden rounded-card border border-border bg-black">
        {failed ? (
          <div className="flex h-64 items-center justify-center text-sm text-white">
            {t("videoLoadFailed")}
          </div>
        ) : playbackUrl ? (
          <>
            <video
              ref={videoRef}
              src={playbackUrl}
              controls
              playsInline
              onPlay={sync.onPlay}
              onPause={sync.onPause}
              onSeeked={sync.onSeeked}
              className="max-h-[520px] w-full"
            />
            {sync.blocked ? (
              <button
                type="button"
                onClick={sync.resume}
                className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm font-semibold text-white"
              >
                ▶️ {t("sync.resume")}
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-white/70">
            {t("videoLoading")}
          </div>
        )}
      </div>
    </div>
  );
}
