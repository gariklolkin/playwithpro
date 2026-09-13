"use client";

import { PLAYBACK_RATE_PRESETS } from "@playwithpro/shared";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Repeat,
  StepBack,
  StepForward,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { formatMoment } from "@/lib/annotation-geometry";
import { formatDuration } from "@/lib/format-duration";
import { frameStepTarget, timelineFraction } from "@/lib/frame-step";

export interface TimelineMoment {
  key: string;
  seconds: number;
}

const ICON_BUTTON =
  "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-white transition-colors hover:bg-white/10 max-[639px]:h-11 max-[639px]:w-11";

/**
 * The review controls under the attached clip, replacing the native player
 * bar. Every action mutates the media element, so the room's media-event
 * handlers publish it to the peer exactly like any other gesture.
 */
export function ReviewPlayerBar({
  videoRef,
  fps,
  paused,
  currentTime,
  duration,
  rate,
  onRateChange,
  moments,
  activeMoment,
  onSeekMoment,
  loop,
  onLoopChange,
  synced,
  onSyncedChange,
  fullscreen,
  onFullscreenToggle,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** The clip's probed frame rate; null falls back to the default. */
  fps: number | null;
  paused: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  onRateChange: (rate: number) => void;
  moments: TimelineMoment[];
  activeMoment: string | null;
  onSeekMoment: (key: string) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  synced: boolean;
  onSyncedChange: (synced: boolean) => void;
  fullscreen: boolean;
  onFullscreenToggle: () => void;
}) {
  const t = useTranslations("sessions.room");
  /** Scrub position while the pointer drags; committed as one seek on release. */
  const [drag, setDrag] = useState<number | null>(null);
  const dragging = useRef(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!speedOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!speedRef.current?.contains(event.target as Node)) {
        setSpeedOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSpeedOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [speedOpen]);

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      void Promise.resolve(video.play()).catch(() => undefined);
    } else {
      video.pause();
    }
  };

  const step = (direction: 1 | -1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = frameStepTarget(
      video.currentTime,
      fps,
      direction,
      video.duration,
    );
  };

  const commitDrag = (value: number) => {
    if (!dragging.current) return;
    dragging.current = false;
    setDrag(null);
    seek(value);
  };

  const shownTime = drag ?? currentTime;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 bg-neutral-950 px-2 py-1.5 text-white">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={paused ? t("player.play") : t("player.pause")}
        title={paused ? t("player.play") : t("player.pause")}
        className={ICON_BUTTON}
      >
        {paused ? <Play size={16} /> : <Pause size={16} />}
      </button>
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label={t("player.frameBack")}
        title={t("player.frameBack")}
        className={ICON_BUTTON}
      >
        <StepBack size={16} />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={t("player.frameForward")}
        title={t("player.frameForward")}
        className={ICON_BUTTON}
      >
        <StepForward size={16} />
      </button>
      <span className="shrink-0 px-1 text-xs tabular-nums text-white/80">
        {formatDuration(shownTime)} / {formatDuration(safeDuration)}
      </span>

      <div className="relative flex min-w-[120px] flex-1 items-center max-[639px]:order-last max-[639px]:basis-full">
        <input
          type="range"
          min={0}
          max={safeDuration}
          step="any"
          value={Math.min(shownTime, safeDuration)}
          aria-label={t("player.timeline")}
          aria-valuetext={formatDuration(shownTime)}
          onPointerDown={() => {
            dragging.current = true;
          }}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (dragging.current) setDrag(value);
            else seek(value);
          }}
          onPointerUp={(event) => commitDrag(Number(event.currentTarget.value))}
          onPointerCancel={() => {
            dragging.current = false;
            setDrag(null);
          }}
          onBlur={(event) => commitDrag(Number(event.currentTarget.value))}
          className="h-1 w-full cursor-pointer accent-white max-[639px]:h-2"
        />
        {moments.length > 0 && safeDuration > 0 ? (
          <div role="group" aria-label={t("player.markers")}>
            {moments.map((moment) => (
              <button
                key={moment.key}
                type="button"
                onClick={() => onSeekMoment(moment.key)}
                aria-pressed={activeMoment === moment.key}
                aria-label={t("annotations.jumpTo", {
                  time: formatMoment(moment.key),
                })}
                title={formatMoment(moment.key)}
                className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border border-neutral-950 ${
                  activeMoment === moment.key ? "bg-white" : "bg-blue-400"
                }`}
                style={{
                  left: `${timelineFraction(moment.seconds, safeDuration) * 100}%`,
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div ref={speedRef} className="relative shrink-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={speedOpen}
          aria-label={t("player.speed", { rate })}
          title={t("player.speed", { rate })}
          onClick={() => setSpeedOpen((open) => !open)}
          className="h-8 cursor-pointer rounded-md border border-white/20 px-2 text-xs font-medium tabular-nums hover:bg-white/10 max-[639px]:h-11"
        >
          {t("speed.value", { rate })}
        </button>
        {speedOpen ? (
          <div
            role="menu"
            aria-label={t("speed.label")}
            className="absolute bottom-full right-0 z-20 mb-1 min-w-[88px] rounded-md border border-white/10 bg-neutral-900 py-1 shadow-lg"
          >
            {PLAYBACK_RATE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                role="menuitemradio"
                aria-checked={rate === preset}
                onClick={() => {
                  onRateChange(preset);
                  setSpeedOpen(false);
                }}
                className={`block w-full cursor-pointer px-3 py-1.5 text-left text-xs tabular-nums hover:bg-white/10 ${
                  rate === preset ? "font-semibold text-white" : "text-white/70"
                }`}
              >
                {t("speed.value", { rate: preset })}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-pressed={loop}
        onClick={() => onLoopChange(!loop)}
        aria-label={t("player.loop")}
        title={t("player.loop")}
        className={`${ICON_BUTTON} ${loop ? "bg-white/20" : ""}`}
      >
        <Repeat size={16} />
      </button>
      <button
        type="button"
        aria-pressed={synced}
        onClick={() => onSyncedChange(!synced)}
        title={synced ? t("sync.onHint") : t("sync.offHint")}
        className={`h-8 shrink-0 cursor-pointer rounded-md border px-2 text-xs font-medium transition-colors max-[639px]:h-11 ${
          synced
            ? "border-white/30 bg-white/10 text-white"
            : "border-white/20 text-white/60 hover:text-white"
        }`}
      >
        {synced ? `🔄 ${t("sync.on")}` : t("sync.off")}
      </button>
      <button
        type="button"
        onClick={onFullscreenToggle}
        aria-label={
          fullscreen ? t("player.exitFullscreen") : t("player.fullscreen")
        }
        title={fullscreen ? t("player.exitFullscreen") : t("player.fullscreen")}
        className={ICON_BUTTON}
      >
        {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
    </div>
  );
}
