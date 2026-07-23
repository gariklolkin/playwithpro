"use client";

import { useEffect, useState } from "react";

/**
 * The current wall-clock time, hydration-safe: null during SSR and the first
 * client render, then refreshed on an interval so time-gated UI (join
 * windows, countdown chips) stays live without impure reads during render.
 */
export function useNow(refreshMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    // Deferred first read keeps the effect free of synchronous setState.
    const kickoff = setTimeout(update, 0);
    const timer = setInterval(update, refreshMs);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [refreshMs]);
  return now;
}
