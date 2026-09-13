"use client";

import type { VideoLimits } from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { formatBytes, formatDuration } from "@/lib/format-duration";

/**
 * The three limit levels, shown before the player hits them: library quota
 * with usage (bar), per-file caps, per-session caps.
 */
export function LibraryLimits({ limits }: { limits: VideoLimits }) {
  const t = useTranslations("videos");
  const locale = useLocale();
  const { library, file, session } = limits;
  const percent = Math.min(
    100,
    Math.round((library.usedBytes / library.maxBytes) * 100),
  );
  return (
    <section
      aria-label={t("quota.title")}
      className="rounded-card border border-border bg-bg p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
        <span className="font-medium text-text">{t("quota.title")}</span>
        <span className="tabular-nums text-text-secondary">
          {t("quota.usage", {
            used: formatBytes(library.usedBytes, locale),
            max: formatBytes(library.maxBytes, locale),
            count: library.count,
            maxVideos: library.maxVideos,
          })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-secondary"
      >
        <div
          className={`h-full rounded-full ${percent >= 90 ? "bg-[#C4554D]" : "bg-text"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] text-text-tertiary">
        {t("limits.file", {
          size: formatBytes(file.maxSizeBytes, locale),
          duration: formatDuration(file.maxDurationSeconds),
        })}{" "}
        ·{" "}
        {t("limits.session", {
          clips: session.maxClips,
          duration: formatDuration(session.maxTotalSeconds),
        })}
      </p>
    </section>
  );
}
