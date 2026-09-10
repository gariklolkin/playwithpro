import { describe, expect, it } from "vitest";
import {
  angleDegrees,
  contentBox,
  formatMoment,
  thinPath,
  toNormalized,
  toPixels,
} from "@/lib/annotation-geometry";

describe("annotation geometry", () => {
  it("letterboxes a wide frame in a tall element", () => {
    // 16:9 frame in a square 400x400 element → bars top and bottom.
    const box = contentBox(400, 400, 1920, 1080);
    expect(box).toEqual({ x: 0, y: 87.5, width: 400, height: 225 });
    // The frame's centre maps to the element's centre.
    expect(toPixels({ x: 0.5, y: 0.5 }, box)).toEqual({ x: 200, y: 200 });
    // A click in the top bar clamps to the frame's top edge.
    expect(toNormalized(200, 10, box)).toEqual({ x: 0.5, y: 0 });
    expect(toNormalized(400, 312.5, box)).toEqual({ x: 1, y: 1 });
  });

  it("pillarboxes a tall frame in a wide element", () => {
    // 9:16 frame in an 800x300 element → bars left and right.
    const box = contentBox(800, 300, 1080, 1920);
    expect(box).toEqual({ x: 315.625, y: 0, width: 168.75, height: 300 });
    const racket = { x: 0.25, y: 0.75 };
    const px = toPixels(racket, box);
    expect(px.x).toBeCloseTo(315.625 + 42.1875);
    expect(px.y).toBeCloseTo(225);
    // Round trip lands on the same normalized spot.
    const back = toNormalized(px.x, px.y, box);
    expect(back.x).toBeCloseTo(racket.x);
    expect(back.y).toBeCloseTo(racket.y);
  });

  it("maps the same normalized point consistently across window sizes", () => {
    const wide = contentBox(1200, 675, 1920, 1080);
    const narrow = contentBox(360, 640, 1920, 1080);
    const point = { x: 0.8, y: 0.3 };
    const a = toNormalized(
      toPixels(point, wide).x,
      toPixels(point, wide).y,
      wide,
    );
    const b = toNormalized(
      toPixels(point, narrow).x,
      toPixels(point, narrow).y,
      narrow,
    );
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
  });

  it("falls back to the whole element before metadata is known", () => {
    expect(contentBox(300, 200, 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    });
    expect(toNormalized(150, 100, contentBox(300, 200, 0, 0))).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("measures the angle at the vertex in whole degrees", () => {
    expect(
      angleDegrees({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }),
    ).toBe(90);
    expect(angleDegrees({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 })).toBe(
      180,
    );
    expect(
      angleDegrees({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }),
    ).toBe(45);
    expect(angleDegrees({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(
      null,
    );
  });

  it("thins a long path evenly while keeping both ends", () => {
    const path = Array.from({ length: 1000 }, (_, i) => i);
    const thinned = thinPath(path, 200);
    expect(thinned).toHaveLength(200);
    expect(thinned[0]).toBe(0);
    expect(thinned.at(-1)).toBe(999);
    expect(thinPath([1, 2, 3], 200)).toEqual([1, 2, 3]);
  });

  it("formats moment keys as m:ss with tenths only when needed", () => {
    expect(formatMoment("134.2")).toBe("2:14.2");
    expect(formatMoment("34.0")).toBe("0:34");
    expect(formatMoment("605.5")).toBe("10:05.5");
  });
});
