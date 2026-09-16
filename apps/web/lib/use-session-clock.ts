"use client";

import { CALL_TIME_REMINDER_BEFORE_END_MIN } from "@playwithpro/shared";
import { useEffect, useRef, useState } from "react";

export type SessionClockPhase = "before" | "during" | "over";
export type SessionClockThreshold = "tenMinutes" | "end";

export interface SessionClockTiming {
  startsAt: string;
  endsAt: string;
  /** The API clock at response time; absent on older API builds. */
  serverNow?: string;
}

export interface SessionClock {
  /** Null until the first tick (hydration-safe: SSR renders no time). */
  phase: SessionClockPhase | null;
  /**
   * Milliseconds to `startsAt` (before), to `endsAt` (during) or elapsed past
   * `endsAt` (over); never negative.
   */
  remainingMs: number;
  /** Server-corrected "now"; null until the first tick. */
  now: number | null;
}

const SECOND = 1000;
const REMINDER_MS = CALL_TIME_REMINDER_BEFORE_END_MIN * 60 * SECOND;

/**
 * Client-to-server clock offset: add it to `Date.now()` to get the server's
 * view of the current time. One-way latency (tens of ms) is below the
 * second resolution everything downstream displays.
 */
export function serverOffset(
  serverNow: string | undefined,
  receivedAt: number,
): number {
  if (!serverNow) return 0;
  const parsed = Date.parse(serverNow);
  return Number.isNaN(parsed) ? 0 : parsed - receivedAt;
}

export function describeClock(
  now: number,
  timing: Pick<SessionClockTiming, "startsAt" | "endsAt">,
): { phase: SessionClockPhase; remainingMs: number } {
  const startsAt = Date.parse(timing.startsAt);
  const endsAt = Date.parse(timing.endsAt);
  if (now < startsAt) return { phase: "before", remainingMs: startsAt - now };
  if (now < endsAt) return { phase: "during", remainingMs: endsAt - now };
  return { phase: "over", remainingMs: now - endsAt };
}

/** `m:ss`, or `h:mm:ss` from one hour up; never negative. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * The session clock as the server sees it, ticking once per second on the
 * second boundary. Threshold callbacks fire only while `active` and only for
 * a crossing observed after activation: a party who connects with seven
 * minutes left never gets the ten-minute reminder but still gets the end one.
 * Ticks compute from absolute timestamps, so a throttled background tab
 * still fires each crossed threshold exactly once when it catches up.
 */
export function useSessionClock(
  timing: SessionClockTiming | null,
  {
    active = false,
    onThreshold,
  }: {
    active?: boolean;
    onThreshold?: (threshold: SessionClockThreshold) => void;
  } = {},
): SessionClock {
  const [clock, setClock] = useState<SessionClock>({
    phase: null,
    remainingMs: 0,
    now: null,
  });
  const offsetRef = useRef(0);
  // Milliseconds to endsAt at the previous tick while active; null arms the
  // detector without firing (first tick after activation).
  const prevToEndRef = useRef<number | null>(null);
  const onThresholdRef = useRef(onThreshold);
  useEffect(() => {
    onThresholdRef.current = onThreshold;
  }, [onThreshold]);

  const serverNow = timing?.serverNow;
  useEffect(() => {
    offsetRef.current = serverOffset(serverNow, Date.now());
  }, [serverNow]);

  useEffect(() => {
    prevToEndRef.current = null;
  }, [active]);

  const startsAt = timing?.startsAt;
  const endsAt = timing?.endsAt;
  useEffect(() => {
    if (!startsAt || !endsAt) return;
    const tick = () => {
      const now = Date.now() + offsetRef.current;
      const described = describeClock(now, { startsAt, endsAt });
      setClock((prev) =>
        prev.phase === described.phase &&
        prev.remainingMs === described.remainingMs &&
        prev.now === now
          ? prev
          : { ...described, now },
      );

      const toEnd = Date.parse(endsAt) - now;
      const prev = prevToEndRef.current;
      prevToEndRef.current = toEnd;
      if (!active || prev === null) return;
      if (prev > 0 && toEnd <= 0) {
        onThresholdRef.current?.("end");
      } else if (prev > REMINDER_MS && toEnd <= REMINDER_MS && toEnd > 0) {
        onThresholdRef.current?.("tenMinutes");
      }
    };
    // First tick is deferred (no synchronous setState in the effect) and
    // lands on the next second boundary so the display flips in step.
    const untilBoundary = SECOND - ((Date.now() + offsetRef.current) % SECOND);
    let interval: ReturnType<typeof setInterval> | null = null;
    const kickoff = setTimeout(() => {
      tick();
      interval = setInterval(tick, SECOND);
    }, untilBoundary);
    return () => {
      clearTimeout(kickoff);
      if (interval) clearInterval(interval);
    };
  }, [startsAt, endsAt, active]);

  return clock;
}
