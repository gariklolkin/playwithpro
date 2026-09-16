/**
 * Link builder for the feedback board (change 25). The board URL is baked at
 * build time; when it is empty (local dev, CI, forks) every entry point
 * renders nothing. The placement lands in `utm_content` so PostHog can
 * count which entry point sends people to the board.
 */
export type FeedbackPlacement = "user-menu" | "coach-dashboard";

export const FEEDBACK_URL = process.env.NEXT_PUBLIC_FEEDBACK_URL ?? "";

export function feedbackUrl(
  placement: FeedbackPlacement,
  base: string = FEEDBACK_URL,
): string | null {
  const trimmed = base.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    url.searchParams.set("utm_source", "app");
    url.searchParams.set("utm_content", placement);
    return url.toString();
  } catch {
    return null;
  }
}
