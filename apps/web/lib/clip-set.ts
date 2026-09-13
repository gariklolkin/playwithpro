import type {
  SessionVideoInput,
  SessionVideosRejection,
  VideoLimits,
  VideoResponse,
} from "@playwithpro/shared";
import { formatDuration } from "@/lib/format-duration";

/** Usage of a clip set against the per-session caps. */
export interface ClipSetStatus {
  count: number;
  totalSeconds: number;
  overCount: boolean;
  overDuration: boolean;
  /** No clips, or over a cap. */
  invalid: boolean;
}

export function clipSetStatus(
  value: SessionVideoInput[],
  videos: VideoResponse[],
  caps: VideoLimits["session"],
): ClipSetStatus {
  const byId = new Map(videos.map((video) => [video.id, video]));
  const totalSeconds = value.reduce(
    (sum, clip) => sum + (byId.get(clip.videoId)?.durationSeconds ?? 0),
    0,
  );
  const overCount = value.length > caps.maxClips;
  const overDuration = totalSeconds > caps.maxTotalSeconds;
  return {
    count: value.length,
    totalSeconds,
    overCount,
    overDuration,
    invalid: value.length === 0 || overCount || overDuration,
  };
}

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Localizes the API's clip-set rejection (`booking.videos.errors.*`), with
 * the cap numbers formatted for display. Falls back to the generic message.
 */
export function clipSetErrorMessage(
  t: Translate,
  body: Record<string, unknown> | null,
  fallback: string,
): string {
  const rejection = body as Partial<SessionVideosRejection> | null;
  switch (rejection?.reason) {
    case "too_many_clips":
      return t("errors.too_many_clips", {
        max: rejection.max ?? 0,
        count: rejection.count ?? 0,
      });
    case "too_long":
      return t("errors.too_long", {
        max: formatDuration(rejection.maxSeconds ?? 0),
        total: formatDuration(rejection.totalSeconds ?? 0),
      });
    case "duplicate":
    case "empty":
    case "not_ready":
      return t(`errors.${rejection.reason}`);
    default:
      return fallback;
  }
}
