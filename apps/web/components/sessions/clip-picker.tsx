"use client";

import {
  SESSION_VIDEO_NOTE_MAX_LENGTH,
  type SessionVideoInput,
  type VideoLimits,
  type VideoResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { clipSetStatus } from "@/lib/clip-set";
import { formatDuration } from "@/lib/format-duration";

/**
 * Picks an ordered clip set from the player's ready videos under the
 * per-session caps: a checkbox per video, a note and move buttons per
 * selected clip, and a meter that shows the caps before they bite.
 */
export function ClipPicker({
  videos,
  caps,
  value,
  onChange,
}: {
  /** The player's ready videos. */
  videos: VideoResponse[];
  caps: VideoLimits["session"];
  value: SessionVideoInput[];
  onChange: (next: SessionVideoInput[]) => void;
}) {
  const t = useTranslations("clips");
  const status = clipSetStatus(value, videos, caps);
  const capReached = status.count >= caps.maxClips;
  const indexOf = (videoId: string) =>
    value.findIndex((clip) => clip.videoId === videoId);

  const toggle = (video: VideoResponse) => {
    const index = indexOf(video.id);
    if (index !== -1) {
      onChange(value.filter((clip) => clip.videoId !== video.id));
      return;
    }
    if (capReached) return;
    onChange([...value, { videoId: video.id, note: null }]);
  };

  const move = (videoId: string, delta: -1 | 1) => {
    const index = indexOf(videoId);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const setNote = (videoId: string, note: string) => {
    onChange(
      value.map((clip) =>
        clip.videoId === videoId ? { ...clip, note: note || null } : clip,
      ),
    );
  };

  return (
    <div>
      <div
        role="status"
        className={`mb-1.5 flex flex-wrap items-center justify-between gap-x-3 text-[12px] tabular-nums ${
          status.overDuration || status.overCount
            ? "text-[#C4554D]"
            : "text-text-tertiary"
        }`}
      >
        <span>
          {t("meter.clips", { count: status.count, max: caps.maxClips })}
        </span>
        <span>
          {t("meter.duration", {
            used: formatDuration(status.totalSeconds),
            max: formatDuration(caps.maxTotalSeconds),
          })}
        </span>
      </div>
      {videos.length === 0 ? (
        <p className="rounded-md bg-bg-secondary p-3 text-[13px] text-text-secondary">
          {t("noVideos")}{" "}
          <Link
            href="/dashboard/videos/upload"
            className="font-medium text-[#2A5FC7] hover:underline"
          >
            {t("uploadCta")}
          </Link>
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {videos.map((video) => {
            const index = indexOf(video.id);
            const selected = index !== -1;
            return (
              <li
                key={video.id}
                className={`rounded-md px-2 py-1.5 text-[13px] text-text ${
                  selected ? "bg-bg-secondary" : "hover:bg-bg-hover"
                }`}
              >
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && capReached}
                    onChange={() => toggle(video)}
                    aria-label={video.title}
                  />
                  {selected ? (
                    <span className="w-4 shrink-0 text-center text-[11px] font-semibold text-text-tertiary">
                      {index + 1}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">
                    📹 {video.title}
                  </span>
                  {video.durationSeconds !== null ? (
                    <span className="shrink-0 text-[12px] tabular-nums text-text-tertiary">
                      {formatDuration(video.durationSeconds)}
                    </span>
                  ) : null}
                </label>
                {selected ? (
                  <div className="mt-1.5 flex items-center gap-1 pl-6">
                    <input
                      type="text"
                      value={value[index].note ?? ""}
                      maxLength={SESSION_VIDEO_NOTE_MAX_LENGTH}
                      placeholder={t("notePlaceholder")}
                      aria-label={t("noteLabel", { title: video.title })}
                      onChange={(event) =>
                        setNote(video.id, event.target.value)
                      }
                      className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 text-[12px] text-text placeholder:text-text-tertiary"
                    />
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(video.id, -1)}
                      aria-label={t("moveUp", { title: video.title })}
                      className="rounded-md border border-border px-1.5 py-0.5 text-[12px] text-text-secondary hover:text-text disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === value.length - 1}
                      onClick={() => move(video.id, 1)}
                      aria-label={t("moveDown", { title: video.title })}
                      className="rounded-md border border-border px-1.5 py-0.5 text-[12px] text-text-secondary hover:text-text disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {status.overDuration ? (
        <p className="mt-1.5 text-[12px] text-[#C4554D]">
          {t("errors.too_long", {
            max: formatDuration(caps.maxTotalSeconds),
            total: formatDuration(status.totalSeconds),
          })}
        </p>
      ) : capReached && videos.length > value.length ? (
        <p className="mt-1.5 text-[12px] text-text-tertiary">
          {t("capReached", { max: caps.maxClips })}
        </p>
      ) : null}
    </div>
  );
}
