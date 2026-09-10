"use client";

import {
  ANNOTATION_LIMITS,
  type AnnotationPoint,
  type AnnotationTool,
  type Stroke,
} from "@playwithpro/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  angleDegrees,
  contentBox,
  thinPath,
  toNormalized,
  toPixels,
  type ContentBox,
} from "@/lib/annotation-geometry";

/** Active drawing tool, or `select` to hand pointer events back to the player. */
export type LayerTool = AnnotationTool | "select";

/** Minimum pointer travel (px) between sampled pen points. */
const PEN_SAMPLE_DISTANCE_PX = 2;
const STROKE_WIDTH_PX = 3;
const ANGLE_LABEL_FONT = "bold 14px system-ui, sans-serif";

interface Draft {
  /** Tool/visibility the draft was started under; a change abandons it. */
  modeKey: string;
  tool: AnnotationTool;
  points: AnnotationPoint[];
  /** Pointer position for previews (line end, angle's third ray). */
  cursor: AnnotationPoint | null;
}

/** Pointer capture is best-effort: browsers throw for an inactive pointer. */
function capturePointer(target: Element, pointerId: number, on: boolean) {
  try {
    if (on) target.setPointerCapture(pointerId);
    else target.releasePointerCapture(pointerId);
  } catch {
    // Not capturable (synthetic or already-ended pointer): drawing still
    // works as long as the pointer stays over the canvas.
  }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    // A tap with the pen: a visible dot.
    ctx.lineTo(points[0].x + 0.1, points[0].y);
  }
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function drawDot(ctx: CanvasRenderingContext2D, p: { x: number; y: number }) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, STROKE_WIDTH_PX + 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawAngleLabel(
  ctx: CanvasRenderingContext2D,
  vertex: { x: number; y: number },
  degrees: number,
  color: string,
) {
  const label = `${degrees}°`;
  ctx.font = ANGLE_LABEL_FONT;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  const x = vertex.x + 8;
  const y = vertex.y - 8;
  // Contrasting halo keeps the number legible over any frame.
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(label, x, y);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
}

/** Renders one stroke (or a draft) in pixel space. */
function drawStroke(
  ctx: CanvasRenderingContext2D,
  tool: AnnotationTool,
  points: AnnotationPoint[],
  color: string,
  box: ContentBox,
  cursor: AnnotationPoint | null,
) {
  const px = points.map((p) => toPixels(p, box));
  const cur = cursor ? toPixels(cursor, box) : null;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = STROKE_WIDTH_PX;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (tool) {
    case "pen":
      drawPath(ctx, px);
      return;
    case "line": {
      const end = px[1] ?? cur;
      if (!end) return;
      drawPath(ctx, [px[0], end]);
      return;
    }
    case "angle": {
      for (const p of px) drawDot(ctx, p);
      const [a, vertex] = px;
      if (!a) return;
      if (!vertex) {
        if (cur) drawPath(ctx, [a, cur]);
        return;
      }
      const b = px[2] ?? cur;
      drawPath(ctx, [a, vertex]);
      if (!b) return;
      drawPath(ctx, [vertex, b]);
      const degrees = angleDegrees(a, vertex, b);
      if (degrees !== null) drawAngleLabel(ctx, vertex, degrees, color);
    }
  }
}

/**
 * Canvas overlay on the attached video. Draws the given strokes in
 * frame-normalized coordinates over the video's content box (letterbox
 * aware, DPR aware) and turns pointer input into complete strokes while a
 * tool is active; without a tool it lets every event through to the player.
 */
export function AnnotationLayer({
  videoRef,
  strokes,
  tool,
  color,
  visible,
  onStrokeComplete,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  strokes: Stroke[];
  tool: LayerTool;
  color: string;
  /** False while playing: nothing is drawn and no input is taken. */
  visible: boolean;
  onStrokeComplete: (tool: AnnotationTool, points: AnnotationPoint[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [box, setBox] = useState<ContentBox>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [element, setElement] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const activePointer = useRef<number | null>(null);

  const setDraftBoth = useCallback((next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  // Track the element rect and the intrinsic frame size.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const measure = () => {
      const width = video.clientWidth;
      const height = video.clientHeight;
      setElement({ width, height });
      setBox(contentBox(width, height, video.videoWidth, video.videoHeight));
    };
    const kickoff = setTimeout(measure, 0);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => measure());
    observer?.observe(video);
    video.addEventListener("loadedmetadata", measure);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(kickoff);
      observer?.disconnect();
      video.removeEventListener("loadedmetadata", measure);
      window.removeEventListener("resize", measure);
    };
  }, [videoRef]);

  // A tool change or hide abandons any half-made draft: drafts carry the
  // mode they were started under and are ignored once it differs.
  const modeKey = `${tool}:${visible}`;
  const liveDraft = draft?.modeKey === modeKey ? draft : null;
  const currentDraft = useCallback(
    () => (draftRef.current?.modeKey === modeKey ? draftRef.current : null),
    [modeKey],
  );

  // Render whenever inputs change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(element.width * dpr));
    const height = Math.max(1, Math.round(element.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, element.width, element.height);
    if (!visible) return;
    for (const stroke of strokes) {
      drawStroke(ctx, stroke.tool, stroke.points, stroke.color, box, null);
    }
    if (liveDraft) {
      drawStroke(
        ctx,
        liveDraft.tool,
        liveDraft.points,
        color,
        box,
        liveDraft.cursor,
      );
    }
  }, [strokes, liveDraft, color, box, element, visible]);

  const pointOf = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): AnnotationPoint => {
      const rect = event.currentTarget.getBoundingClientRect();
      return toNormalized(
        event.clientX - rect.left,
        event.clientY - rect.top,
        box,
      );
    },
    [box],
  );

  const drawing = visible && tool !== "select";

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!visible || tool === "select") return;
    const current = currentDraft();
    if (activePointer.current !== null && current) return;
    activePointer.current = null;
    event.preventDefault();
    const point = pointOf(event);
    if (tool === "angle") {
      const points = [...(current?.points ?? []), point];
      if (points.length === 3) {
        setDraftBoth(null);
        onStrokeComplete("angle", points);
        return;
      }
      setDraftBoth({ modeKey, tool: "angle", points, cursor: point });
      return;
    }
    activePointer.current = event.pointerId;
    capturePointer(event.currentTarget, event.pointerId, true);
    setDraftBoth({ modeKey, tool, points: [point], cursor: point });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const current = currentDraft();
    if (!current) return;
    const point = pointOf(event);
    if (current.tool === "angle" || current.tool === "line") {
      setDraftBoth({ ...current, cursor: point });
      return;
    }
    if (activePointer.current !== event.pointerId) return;
    const last = current.points.at(-1);
    if (last) {
      const dx = (point.x - last.x) * box.width;
      const dy = (point.y - last.y) * box.height;
      if (Math.hypot(dx, dy) < PEN_SAMPLE_DISTANCE_PX) return;
    }
    setDraftBoth({
      ...current,
      points: [...current.points, point],
      cursor: point,
    });
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    capturePointer(event.currentTarget, event.pointerId, false);
    const current = currentDraft();
    if (!current || current.tool === "angle") return;
    setDraftBoth(null);
    const end = pointOf(event);
    if (current.tool === "line") {
      const [start] = current.points;
      if (start.x === end.x && start.y === end.y) return;
      onStrokeComplete("line", [start, end]);
      return;
    }
    onStrokeComplete(
      "pen",
      thinPath(current.points, ANNOTATION_LIMITS.pointsPerStroke),
    );
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current === event.pointerId) {
      activePointer.current = null;
      setDraftBoth(null);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      data-testid="annotation-layer"
      aria-hidden={!drawing}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={onPointerCancel}
      className="absolute inset-0 h-full w-full"
      style={{
        pointerEvents: drawing ? "auto" : "none",
        touchAction: drawing ? "none" : "auto",
        cursor: drawing ? "crosshair" : undefined,
      }}
    />
  );
}
