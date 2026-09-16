/**
 * Build-time observability configuration for the browser bundle. All values
 * are optional: without `NEXT_PUBLIC_POSTHOG_KEY` every hook in this folder
 * is a no-op and the vendor SDK is never loaded (local dev, CI).
 */
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

/** Same-origin ingestion path proxied to the vendor (see next.config.ts). */
export const POSTHOG_PROXY_PATH = "/ph";

/** Vendor UI host (toolbar links, replay deep links); never receives events. */
export const POSTHOG_UI_HOST = "https://eu.posthog.com";

/** Deploy SHA baked by Dockerfile.prod; `unknown` for local builds. */
export const APP_RELEASE = process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown";

export const APP_ENVIRONMENT = process.env.NODE_ENV ?? "development";

/** Share of consenting sessions that get a replay, 0..1 (default 0.5). */
export const REPLAY_SAMPLE_RATE = clampRate(
  process.env.NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE,
  0.5,
);

/** Recordings shorter than this are dropped (vendor-side minimum duration). */
export const REPLAY_MINIMUM_DURATION_MS = 5_000;

export function isObservabilityEnabled(): boolean {
  return POSTHOG_KEY !== "";
}

export function clampRate(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (raw === undefined || raw === "" || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}
