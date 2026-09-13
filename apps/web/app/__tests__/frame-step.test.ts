import { describe, expect, it } from "vitest";
import {
  DEFAULT_FPS,
  frameStepTarget,
  timelineFraction,
} from "@/lib/frame-step";

/** The frame a position falls on, the way a decoder would pick it. */
const frameAt = (seconds: number, fps: number) => Math.floor(seconds * fps);

describe("frameStepTarget", () => {
  it("moves one frame forward at the clip's frame rate", () => {
    const target = frameStepTarget(134, 60, 1, 300);
    expect(frameAt(target, 60)).toBe(134 * 60 + 1);
  });

  it("moves one frame back at 30 fps", () => {
    const target = frameStepTarget(2, 30, -1, 300);
    expect(frameAt(target, 30)).toBe(2 * 30 - 1);
  });

  it("uses the default rate when the frame rate is unknown", () => {
    const target = frameStepTarget(1, null, 1, 300);
    expect(frameAt(target, DEFAULT_FPS)).toBe(DEFAULT_FPS + 1);
  });

  it("lands just past the boundary so repeated steps keep advancing", () => {
    let t = 0;
    for (let i = 0; i < 5; i += 1) t = frameStepTarget(t, 25, 1, 300);
    expect(frameAt(t, 25)).toBe(5);
    expect(t - 5 / 25).toBeGreaterThan(0);
    expect(t - 5 / 25).toBeLessThan(1 / 250);
  });

  it("clamps to the start and to the duration", () => {
    expect(frameStepTarget(0, 30, -1, 300)).toBe(0);
    expect(frameStepTarget(20, 30, 1, 20)).toBe(20);
  });
});

describe("timelineFraction", () => {
  it("maps seconds onto the track and tolerates an unknown duration", () => {
    expect(timelineFraction(5, 20)).toBe(0.25);
    expect(timelineFraction(30, 20)).toBe(1);
    expect(timelineFraction(5, Number.NaN)).toBe(0);
  });
});
