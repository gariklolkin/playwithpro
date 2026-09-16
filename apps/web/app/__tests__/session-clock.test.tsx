import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeClock,
  formatClock,
  serverOffset,
  useSessionClock,
} from "@/lib/use-session-clock";

const MINUTE = 60_000;

function timing(now: number, offsetMs = 0) {
  return {
    startsAt: new Date(now - 30 * MINUTE).toISOString(),
    endsAt: new Date(now + 30 * MINUTE).toISOString(),
    // The server is `offsetMs` ahead of this client.
    serverNow: new Date(now + offsetMs).toISOString(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("serverOffset / describeClock / formatClock", () => {
  it("corrects a skewed client clock", () => {
    const now = Date.now();
    expect(serverOffset(new Date(now + 5 * MINUTE).toISOString(), now)).toBe(
      5 * MINUTE,
    );
    expect(serverOffset(undefined, now)).toBe(0);
    expect(serverOffset("garbage", now)).toBe(0);
  });

  it("describes before / during / over", () => {
    const now = Date.now();
    const t = timing(now);
    expect(describeClock(now - 40 * MINUTE, t)).toEqual({
      phase: "before",
      remainingMs: 10 * MINUTE,
    });
    expect(describeClock(now, t)).toEqual({
      phase: "during",
      remainingMs: 30 * MINUTE,
    });
    expect(describeClock(now + 35 * MINUTE, t)).toEqual({
      phase: "over",
      remainingMs: 5 * MINUTE,
    });
  });

  it("formats minutes and hours", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
    expect(formatClock(9 * MINUTE + 5_000)).toBe("9:05");
    expect(formatClock(61 * MINUTE)).toBe("1:01:00");
  });
});

describe("useSessionClock", () => {
  it("uses the server clock, not the device clock", () => {
    // Device is five minutes behind the server.
    const t = timing(Date.now(), 5 * MINUTE);
    const { result } = renderHook(() => useSessionClock(t));
    expect(result.current.phase).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.phase).toBe("during");
    // 30 min on the device clock minus the 5 min the server is ahead,
    // minus the one second until the first boundary tick.
    expect(result.current.remainingMs).toBe(25 * MINUTE - 1_000);
  });

  it("fires the ten-minute and end reminders once each while active", () => {
    const onThreshold = vi.fn();
    const t = timing(Date.now());
    renderHook(() => useSessionClock(t, { active: true, onThreshold }));
    act(() => {
      vi.advanceTimersByTime(20 * MINUTE + 1_000);
    });
    expect(onThreshold).toHaveBeenCalledTimes(1);
    expect(onThreshold).toHaveBeenLastCalledWith("tenMinutes");
    act(() => {
      vi.advanceTimersByTime(10 * MINUTE);
    });
    expect(onThreshold).toHaveBeenCalledTimes(2);
    expect(onThreshold).toHaveBeenLastCalledWith("end");
    act(() => {
      vi.advanceTimersByTime(5 * MINUTE);
    });
    expect(onThreshold).toHaveBeenCalledTimes(2);
  });

  it("does not fire while inactive", () => {
    const onThreshold = vi.fn();
    const t = timing(Date.now());
    renderHook(() => useSessionClock(t, { active: false, onThreshold }));
    act(() => {
      vi.advanceTimersByTime(35 * MINUTE);
    });
    expect(onThreshold).not.toHaveBeenCalled();
  });

  it("skips the ten-minute reminder for a late joiner, keeps the end one", () => {
    const onThreshold = vi.fn();
    const now = Date.now();
    const t = {
      startsAt: new Date(now - 53 * MINUTE).toISOString(),
      endsAt: new Date(now + 7 * MINUTE).toISOString(),
      serverNow: new Date(now).toISOString(),
    };
    const { rerender } = renderHook(
      ({ active }) => useSessionClock(t, { active, onThreshold }),
      { initialProps: { active: false } },
    );
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    rerender({ active: true });
    act(() => {
      vi.advanceTimersByTime(3 * MINUTE);
    });
    expect(onThreshold).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5 * MINUTE);
    });
    expect(onThreshold).toHaveBeenCalledTimes(1);
    expect(onThreshold).toHaveBeenCalledWith("end");
  });

  it("fires only the end reminder when a throttled tab skips past both", () => {
    const onThreshold = vi.fn();
    const t = timing(Date.now());
    renderHook(() => useSessionClock(t, { active: true, onThreshold }));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    // One late tick: 29 minutes pass without the interval running.
    act(() => {
      vi.setSystemTime(Date.now() + 31 * MINUTE);
      vi.advanceTimersByTime(1_000);
    });
    expect(onThreshold).toHaveBeenCalledTimes(1);
    expect(onThreshold).toHaveBeenCalledWith("end");
  });
});
