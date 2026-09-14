"use client";

import {
  ANNOTATION_ROLE_COLORS,
  MOMENT_TOLERANCE_SECONDS,
  Role,
  momentKeyOf,
  momentSecondsOf,
  type AnnotationPoint,
  type AnnotationTool,
  type SessionVideoItem,
  type VideoUrlResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnnotationLayer,
  type LayerTool,
} from "@/components/sessions/annotation-layer";
import { AnnotationToolbar } from "@/components/sessions/annotation-toolbar";
import { ReviewPlayerBar } from "@/components/sessions/review-player-bar";
import { formatMoment } from "@/lib/annotation-geometry";
import { apiFetch } from "@/lib/api";
import { clipAnnotations, useAnnotations } from "@/lib/use-annotations";
import { useSyncedPlayback } from "@/lib/use-synced-playback";

interface PlayerPosition {
  paused: boolean;
  timeSeconds: number;
  durationSeconds: number;
}

/** Where the video card sits inside the panel, for aligning the call rail. */
export interface CardLayout {
  top: number;
  height: number;
}

const LANDSCAPE = 16 / 9;

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

type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

/**
 * The attached clips in video-analysis rooms: a tab per clip and a video
 * card for the active one — frame, left-edge annotation tools and the review
 * player bar — over short-lived pre-signed URLs (the API admits both the
 * owner and the session coach). Playback state — including which clip is
 * active — is shared between the parties over the sync channel, with a
 * per-user toggle to detach and browse privately. Strokes belong to the clip
 * they were drawn on. The card's aspect ratio and position are reported so
 * the room can size the card and align the call rail with it.
 */
export function RoomVideoPanel({
  sessionId,
  videos,
  userId,
  role,
  onAspectChange,
  onCardLayout,
}: {
  sessionId: string;
  /** The session's clips in order; at least one. */
  videos: SessionVideoItem[];
  userId: string;
  role: Role;
  onAspectChange?: (aspect: number) => void;
  onCardLayout?: (layout: CardLayout) => void;
}) {
  const t = useTranslations("sessions.room");
  const [activeId, setActiveId] = useState<string | null>(
    videos[0]?.videoId ?? null,
  );
  const active = videos.find((clip) => clip.videoId === activeId) ?? null;
  /** Signed URLs per clip, so switching back does not re-request. */
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failedIds, setFailedIds] = useState<Record<string, true>>({});
  /** Frame aspect read from the loaded media, which beats the probe. */
  const [loadedAspects, setLoadedAspects] = useState<Record<string, number>>(
    {},
  );
  const playbackUrl = activeId ? (urls[activeId] ?? null) : null;
  const failed = activeId ? failedIds[activeId] === true : false;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onRemoteClip = useCallback(
    (videoId: string) => {
      if (videos.some((clip) => clip.videoId === videoId)) {
        setActiveId(videoId);
      }
    },
    [videos],
  );
  const sync = useSyncedPlayback(sessionId, videoRef, {
    videoId: activeId,
    onRemoteClip,
  });
  const annotations = useAnnotations(sync.socket, userId);
  const clipState = clipAnnotations(annotations.state, activeId);
  /** Mirrors the element's playbackRate for the speed menu (any source). */
  const [rate, setRate] = useState(1);
  const applyRate = (next: number) => {
    const video = videoRef.current;
    if (!video) return;
    // The ratechange event publishes it, so every rate source shares one path.
    video.playbackRate = next;
  };
  const [loop, setLoop] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const defaultColor =
    role === Role.Amateur
      ? ANNOTATION_ROLE_COLORS.amateur
      : ANNOTATION_ROLE_COLORS.professional;
  const [tool, setTool] = useState<LayerTool>("select");
  const [color, setColor] = useState<string>(defaultColor);
  const [position, setPosition] = useState<PlayerPosition>({
    paused: true,
    timeSeconds: 0,
    durationSeconds: 0,
  });

  const probedAspect =
    active?.width && active.height ? active.width / active.height : null;
  const aspect =
    (activeId ? loadedAspects[activeId] : undefined) ??
    probedAspect ??
    LANDSCAPE;

  useEffect(() => {
    onAspectChange?.(aspect);
  }, [aspect, onAspectChange]);

  useEffect(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    if (!root || !card || !onCardLayout) return;
    if (typeof ResizeObserver === "undefined") return;
    const report = () =>
      onCardLayout({ top: card.offsetTop, height: card.offsetHeight });
    const observer = new ResizeObserver(report);
    observer.observe(root);
    observer.observe(card);
    return () => observer.disconnect();
  }, [onCardLayout]);

  useEffect(() => {
    const onChange = () =>
      setFullscreen(
        cardRef.current !== null &&
          document.fullscreenElement === cardRef.current,
      );
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!activeId || urls[activeId] || failedIds[activeId]) return;
    let cancelled = false;
    const fail = () =>
      setFailedIds((prev) => ({ ...prev, [activeId]: true as const }));
    void apiFetch(`/videos/${activeId}/playback-url`).then(
      async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          fail();
          return;
        }
        const { url } = (await response.json()) as VideoUrlResponse;
        if (!cancelled) setUrls((prev) => ({ ...prev, [activeId]: url }));
      },
      () => {
        if (!cancelled) fail();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeId, urls, failedIds]);

  const readPosition = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setPosition({
      paused: video.paused || video.ended,
      timeSeconds: video.currentTime,
      durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
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
      Object.keys(clipState).sort(
        (a, b) => momentSecondsOf(a) - momentSecondsOf(b),
      ),
    [clipState],
  );
  const timelineMoments = useMemo(
    () => momentKeys.map((key) => ({ key, seconds: momentSecondsOf(key) })),
    [momentKeys],
  );
  const shownMoment = position.paused
    ? nearestMoment(momentKeys, position.timeSeconds)
    : null;
  /** Where a new stroke goes: the moment on screen, else the exact frame. */
  const targetMoment = shownMoment ?? momentKeyOf(position.timeSeconds);
  const shownStrokes = shownMoment ? (clipState[shownMoment] ?? []) : [];
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
    if (!activeId) return;
    annotations.add(activeId, targetMoment, strokeTool, color, points);
  };

  /** A local tab click; the sync hook publishes the switch for the peer. */
  const selectClip = (videoId: string) => {
    if (videoId === activeId) return;
    setTool("select");
    setPosition({ paused: true, timeSeconds: 0, durationSeconds: 0 });
    setActiveId(videoId);
  };

  const seekToMoment = (key: string) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = momentSecondsOf(key);
    readPosition();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void Promise.resolve(document.exitFullscreen()).catch(() => undefined);
      return;
    }
    const card = cardRef.current;
    if (card && typeof card.requestFullscreen === "function") {
      void Promise.resolve(card.requestFullscreen()).catch(() => undefined);
      return;
    }
    // iOS Safari: only the video element itself can go full screen (native
    // controls, no annotation layer).
    (videoRef.current as FullscreenVideo | null)?.webkitEnterFullscreen?.();
  };

  const ready = playbackUrl !== null && !failed;

  return (
    <div ref={rootRef} className="relative min-w-0">
      {videos.length > 1 ? (
        <div
          role="tablist"
          aria-label={t("clips.label")}
          className="mb-2 flex gap-1 overflow-x-auto pb-1"
        >
          {videos.map((clip, index) => (
            <button
              key={clip.videoId}
              type="button"
              role="tab"
              aria-selected={clip.videoId === activeId}
              onClick={() => selectClip(clip.videoId)}
              className={`shrink-0 max-w-[200px] truncate rounded-md border px-2.5 py-1 text-[13px] transition-colors ${
                clip.videoId === activeId
                  ? "border-text bg-text text-white"
                  : "border-border-strong text-text hover:bg-bg-hover"
              }`}
            >
              {index + 1}. {clip.title}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mb-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-text">
        📹{" "}
        <span className="truncate">
          {active?.title ?? t("videoPanelTitle")}
        </span>
        {active?.note ? (
          <span className="truncate text-[13px] font-normal text-text-secondary">
            — {active.note}
          </span>
        ) : null}
      </div>
      <div
        ref={cardRef}
        // A container so the player bar can wrap by card width, not viewport.
        className={`@container overflow-hidden bg-black ${
          fullscreen
            ? "flex h-full w-full flex-col"
            : "rounded-card border border-border"
        }`}
      >
        <div
          className={`relative w-full ${
            fullscreen ? "min-h-0 flex-1" : "max-h-[var(--frame-h,520px)]"
          }`}
          style={fullscreen ? undefined : { aspectRatio: String(aspect) }}
        >
          {failed ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white">
              {t("videoLoadFailed")}
            </div>
          ) : playbackUrl ? (
            <>
              <video
                key={activeId ?? "none"}
                ref={videoRef}
                src={playbackUrl}
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
                onRateChange={() => {
                  setRate(videoRef.current?.playbackRate ?? 1);
                  sync.onRateChange();
                }}
                onTimeUpdate={readPosition}
                onDurationChange={readPosition}
                onEnded={() => {
                  const video = videoRef.current;
                  if (!loop || !video) return;
                  video.currentTime = 0;
                  void Promise.resolve(video.play()).catch(() => undefined);
                }}
                onLoadedMetadata={() => {
                  const video = videoRef.current;
                  if (
                    video &&
                    activeId &&
                    video.videoWidth &&
                    video.videoHeight
                  ) {
                    const loaded = video.videoWidth / video.videoHeight;
                    setLoadedAspects((prev) =>
                      prev[activeId] === loaded
                        ? prev
                        : { ...prev, [activeId]: loaded },
                    );
                  }
                  readPosition();
                  sync.onSourceReady();
                }}
                className="absolute inset-0 block h-full w-full object-contain"
              />
              <AnnotationLayer
                // Remount with the clip: the layer binds to the <video>
                // element it sees at mount, and the element is keyed too.
                key={`layer-${activeId ?? "none"}`}
                videoRef={videoRef}
                strokes={shownStrokes}
                tool={tool}
                color={color}
                visible={position.paused}
                onStrokeComplete={onStrokeComplete}
              />
              <AnnotationToolbar
                tool={tool}
                onToolChange={activateTool}
                color={color}
                defaultColor={defaultColor}
                onColorChange={setColor}
                onUndo={() =>
                  activeId &&
                  shownMoment &&
                  annotations.undo(activeId, shownMoment)
                }
                onClear={() =>
                  activeId &&
                  shownMoment &&
                  annotations.clear(activeId, shownMoment)
                }
                canUndo={canUndo}
                canClear={shownStrokes.length > 0}
              />
              {sync.blocked ? (
                <button
                  type="button"
                  onClick={sync.resume}
                  className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 text-sm font-semibold text-white"
                >
                  ▶️ {t("sync.resume")}
                </button>
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
              {t("videoLoading")}
            </div>
          )}
        </div>
        {ready ? (
          <ReviewPlayerBar
            videoRef={videoRef}
            fps={active?.fps ?? null}
            paused={position.paused}
            currentTime={position.timeSeconds}
            duration={
              position.durationSeconds || (active?.durationSeconds ?? 0)
            }
            rate={rate}
            onRateChange={applyRate}
            moments={timelineMoments}
            activeMoment={shownMoment}
            onSeekMoment={seekToMoment}
            loop={loop}
            onLoopChange={setLoop}
            synced={sync.synced}
            onSyncedChange={sync.setSynced}
            fullscreen={fullscreen}
            onFullscreenToggle={toggleFullscreen}
          />
        ) : null}
      </div>
      {ready && momentKeys.length > 0 ? (
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
              className={`rounded-tag border px-2 py-0.5 text-xs tabular-nums transition-colors max-[639px]:py-2 ${
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
    </div>
  );
}
