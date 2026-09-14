import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationLayer } from "@/components/sessions/annotation-layer";

beforeEach(() => {
  // jsdom has no 2D context; the layer skips drawing on null.
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => null),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

/** A <video> that reports the given rendered and intrinsic size. */
function videoOfSize(width: number, height: number) {
  const video = document.createElement("video");
  for (const [name, value] of [
    ["clientWidth", width],
    ["clientHeight", height],
    ["videoWidth", width],
    ["videoHeight", height],
  ] as const) {
    Object.defineProperty(video, name, { configurable: true, value });
  }
  document.body.appendChild(video);
  return video;
}

async function renderLayer(video: HTMLVideoElement) {
  const videoRef = createRef<HTMLVideoElement | null>();
  videoRef.current = video;
  const onStrokeComplete = vi.fn();
  const utils = render(
    <AnnotationLayer
      videoRef={videoRef}
      strokes={[]}
      tool="pen"
      color="#f97316"
      visible
      onStrokeComplete={onStrokeComplete}
    />,
  );
  // The first measurement is deferred a tick.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const canvas = utils.container.querySelector("canvas") as HTMLCanvasElement;
  return { ...utils, canvas, onStrokeComplete };
}

describe("AnnotationLayer", () => {
  it("takes no input and paints nothing while the frame has no measured size", async () => {
    const { canvas, onStrokeComplete } = await renderLayer(videoOfSize(0, 0));
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(canvas.style.pointerEvents).toBe("none");

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 40, clientY: 40 });
    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("draws once the frame is measured", async () => {
    const { canvas, onStrokeComplete } = await renderLayer(
      videoOfSize(400, 300),
    );
    expect(canvas.width).toBe(400);
    expect(canvas.style.pointerEvents).toBe("auto");

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 40, clientY: 40 });
    expect(onStrokeComplete).toHaveBeenCalledWith("pen", expect.any(Array));
  });
});
