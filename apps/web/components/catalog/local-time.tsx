"use client";

import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** True after hydration only — the SSR snapshot stays false. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Renders a UTC instant in the viewer's (browser) timezone. Formats only
 * after mount so server HTML never bakes in the server's timezone.
 */
export function LocalTime({
  iso,
  dateStyle = "medium",
  timeStyle = "short",
}: {
  iso: string;
  dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];
}) {
  const locale = useLocale();
  const mounted = useMounted();
  const text = mounted
    ? new Intl.DateTimeFormat(locale, { dateStyle, timeStyle }).format(
        new Date(iso),
      )
    : null;

  // Reserve the slot so the layout doesn't jump when the text appears.
  return <span suppressHydrationWarning>{text ?? "…"}</span>;
}
