import type { AnnotationPoint } from "@playwithpro/shared";

/** Pixel rectangle of the rendered video frame inside its element. */
export interface ContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the frame actually paints inside a `<video>` element (default
 * `object-fit: contain`): letterboxed when the element is taller than the
 * frame's aspect, pillarboxed when it is wider. Unknown intrinsic size
 * (metadata not loaded yet) maps to the whole element.
 */
export function contentBox(
  elementWidth: number,
  elementHeight: number,
  videoWidth: number,
  videoHeight: number,
): ContentBox {
  if (
    elementWidth <= 0 ||
    elementHeight <= 0 ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return {
      x: 0,
      y: 0,
      width: Math.max(0, elementWidth),
      height: Math.max(0, elementHeight),
    };
  }
  const scale = Math.min(
    elementWidth / videoWidth,
    elementHeight / videoHeight,
  );
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    x: (elementWidth - width) / 2,
    y: (elementHeight - height) / 2,
    width,
    height,
  };
}

/** Element-relative pixels → normalized frame coordinates, clamped to 0..1. */
export function toNormalized(
  px: number,
  py: number,
  box: ContentBox,
): AnnotationPoint {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: box.width > 0 ? clamp((px - box.x) / box.width) : 0,
    y: box.height > 0 ? clamp((py - box.y) / box.height) : 0,
  };
}

/** Normalized frame coordinates → element-relative pixels. */
export function toPixels(
  point: AnnotationPoint,
  box: ContentBox,
): { x: number; y: number } {
  return { x: box.x + point.x * box.width, y: box.y + point.y * box.height };
}

/**
 * Angle at `vertex` between rays to `a` and `b`, in whole degrees (0..180),
 * measured in pixel space so the on-screen aspect ratio is respected. Null
 * while either ray has no length.
 */
export function angleDegrees(
  a: { x: number; y: number },
  vertex: { x: number; y: number },
  b: { x: number; y: number },
): number | null {
  const ax = a.x - vertex.x;
  const ay = a.y - vertex.y;
  const bx = b.x - vertex.x;
  const by = b.y - vertex.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la === 0 || lb === 0) return null;
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

/** Evenly thins a path to at most `limit` points, keeping both ends. */
export function thinPath<T>(points: T[], limit: number): T[] {
  if (points.length <= limit || limit < 2) return points.slice(0, limit);
  const out: T[] = [];
  const step = (points.length - 1) / (limit - 1);
  for (let i = 0; i < limit; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

/** `"134.2"` → `"2:14.2"`; whole seconds render without the fraction. */
export function formatMoment(momentKey: string): string {
  const seconds = Number(momentKey);
  if (!Number.isFinite(seconds)) return momentKey;
  const whole = Math.floor(seconds);
  const tenths = Math.round((seconds - whole) * 10);
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return tenths === 0 ? `${minutes}:${rest}` : `${minutes}:${rest}.${tenths}`;
}
