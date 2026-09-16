"use client";

import { useEffect } from "react";
import {
  track,
  type EventProperties,
  type FunnelEvent,
} from "@/lib/observability/analytics";

/** Emits one funnel event when a server-rendered page mounts. */
export function TrackView({
  event,
  properties,
}: {
  event: FunnelEvent;
  properties?: EventProperties;
}) {
  const serialized = JSON.stringify(properties ?? null);
  useEffect(() => {
    track(event, JSON.parse(serialized) as EventProperties | undefined);
  }, [event, serialized]);
  return null;
}
