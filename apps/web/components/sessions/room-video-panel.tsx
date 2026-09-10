"use client";

import {
  ANNOTATION_ROLE_COLORS,
  MOMENT_TOLERANCE_SECONDS,
  Role,
  momentKeyOf,
  momentSecondsOf,
  type AnnotationPoint,
  type AnnotationTool,
  type VideoUrlResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnnotationLayer,
  type LayerTool,
} from "@/components/sessions/annotation-layer";
import { AnnotationToolbar } from "@/components/sessions/annotation-toolbar";
import { formatMoment } from "@/lib/annotation-geometry";
import { apiFetch } from "@/lib/api";
import { useAnnotations } from "@/lib/use-annotations";
import { useSyncedPlayback } from "@/lib/use-synced-playback";

interface PlayerPosition {
  paused: boolean;
  timeSeconds: number;
}

/** The annotated moment the paused player sits on, if any (within tolerance). */
function nearestMoment(keys: string[], timeSeconds: number): string | null {
  let best: string | null = null;
  let bestDistance = MOMENT_TOLERANCE_SECONDS;
  for (const key of keys) {
    const distance = Math.abs(momentSecondsOf(key) - timeSeconds);
    if (distance <= bestDistance) {
      best = key;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The attached video next to the call in video-analysis rooms. Plays over a
 * short-lived pre-signed URL; the API admits both the owner and the session
 * coach. Playback state is shared between the parties over the sync channel,
 * with a per-user toggle to detach and scrub privately. An annotation layer
 * over the paused frame lets both parties draw for each other in real time.
 */
export function RoomVideoPanel({
  sessionId,
  videoId,
  videoTitle,
  userId,
  role,
}: {
  sessionId: string;
  videoId: string;
  videoTitle: string | null;
  userId: string;
  role: Role;
}) {
  const t = useTranslations("sessions.room");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sync = useSyncedPlayback(sessionId, videoRef);
  const annotations = useAnnotations(sync.socket, userId);

  const defaultColor =
    role === Role.Amateur
      ? ANNOTATION_ROLE_COLORS.amateur
      : ANNOTATION_ROLE_COLORS.professional;
  const [tool, setTool] = useState<LayerTool>("select");
  const [color, setColor] = useState<string>(defaultColor);
  const [position, setPosition] = useState<PlayerPosition>({
    paused: true,
    timeSeconds: 0,
  });

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

  const readPosition = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setPosition({
      paused: video.paused || video.ended,
      timeSeconds: video.currentTime,
    });
  }, []);

  // Escape leaves drawing mode.
  useEffect(() => {
    if (tool === "select") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTool("select");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tool]);

  const momentKeys = useMemo(
    () =>
      Object.keys(annotations.state).sort(
        (a, b) => momentSecondsOf(a) - momentSecondsOf(b),
      ),
    [annotations.state],
  );
  const shownMoment = position.paused
    ? nearestMoment(momentKeys, position.timeSeconds)
    : null;
  /** Where a new stroke goes: the moment on screen, else the exact frame. */
  const targetMoment = shownMoment ?? momentKeyOf(position.timeSeconds);
  const shownStrokes = shownMoment ? annotations.state[shownMoment] : [];
  const canUndo = shownStrokes.some((s) => s.authorId === userId);

  const activateTool = (next: LayerTool) => {
    const video = videoRef.current;
    if (next !== "select" && video && !video.paused) {
      // Pausing goes through the media event → sync publish, so the peer
      // lands on the same frame.
      video.pause();
    }
    setTool(next);
  };

  const onStrokeComplete = (
    strokeTool: AnnotationTool,
    points: AnnotationPoint[],
  ) => {
    annotations.add(targetMoment, strokeTool, color, points);
  };

  const seekToMoment = (key: string) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = momentSecondsOf(key);
    readPosition();
  };

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
              onPlay={() => {
                readPosition();
                sync.onPlay();
              }}
              onPause={() => {
                readPosition();
                sync.onPause();
              }}
              onSeeked={() => {
                readPosition();
                sync.onSeeked();
              }}
              onTimeUpdate={readPosition}
              onLoadedMetadata={readPosition}
              className="block max-h-[520px] w-full"
            />
            <AnnotationLayer
              videoRef={videoRef}
              strokes={shownStrokes}
              tool={tool}
              color={color}
              visible={position.paused}
              onStrokeComplete={onStrokeComplete}
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
      {playbackUrl && !failed ? (
        <>
          <AnnotationToolbar
            tool={tool}
            onToolChange={activateTool}
            color={color}
            defaultColor={defaultColor}
            onColorChange={setColor}
            onUndo={() => shownMoment && annotations.undo(shownMoment)}
            onClear={() => shownMoment && annotations.clear(shownMoment)}
            canUndo={canUndo}
            canClear={shownStrokes.length > 0}
          />
          {momentKeys.length > 0 ? (
            <div
              role="group"
              aria-label={t("annotations.moments")}
              className="mt-2 flex flex-wrap items-center gap-1"
            >
              <span className="text-xs text-text-tertiary">
                {t("annotations.moments")}:
              </span>
              {momentKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => seekToMoment(key)}
                  aria-pressed={shownMoment === key}
                  title={t("annotations.jumpTo", { time: formatMoment(key) })}
                  className={`rounded-tag border px-2 py-0.5 text-xs tabular-nums transition-colors ${
                    shownMoment === key
                      ? "border-border-strong bg-bg-secondary text-text"
                      : "border-border text-text-secondary hover:text-text"
                  }`}
                >
                  {formatMoment(key)}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
