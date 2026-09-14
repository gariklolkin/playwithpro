import { Role } from "@playwithpro/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { RoomVideoPanel } from "@/components/sessions/room-video-panel";

const socketEmit = vi.fn();
const socketHandlers = new Map<string, (payload: unknown) => void>();
const ioMock = vi.fn(() => ({
  on: (event: string, handler: (payload: unknown) => void) => {
    socketHandlers.set(event, handler);
  },
  off: (event: string) => {
    socketHandlers.delete(event);
  },
  connected: false,
  emit: socketEmit,
  disconnect: vi.fn(),
}));

vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => ioMock(...(args as [])),
}));

const fetchMock = vi.fn();
const playMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ url: "https://cdn.example/video.mp4" }),
  });
  playMock.mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: playMock,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
  // jsdom has no 2D context; the annotation layer skips drawing on null.
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => null),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  socketHandlers.clear();
});

const CLIPS = [
  {
    videoId: "video-1",
    title: "Match footage",
    note: null,
    durationSeconds: 300,
    fps: 30,
    width: 1920,
    height: 1080,
    position: 0,
  },
  {
    videoId: "video-2",
    title: "Serve drill",
    note: "serve",
    durationSeconds: 45,
    fps: null,
    width: null,
    height: null,
    position: 1,
  },
];

async function renderPanel(
  videos = CLIPS.slice(0, 1),
  extra: {
    onAspectChange?: (aspect: number) => void;
  } = {},
) {
  const utils = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RoomVideoPanel
        sessionId="session-1"
        videos={videos}
        userId="coach-1"
        role={Role.Professional}
        {...extra}
      />
    </NextIntlClientProvider>,
  );
  const video = (await waitFor(() => {
    const el = utils.container.querySelector("video");
    expect(el).not.toBeNull();
    return el;
  })) as HTMLVideoElement;
  return { ...utils, video };
}

/** jsdom media elements have no duration; give one and announce it. */
function setDuration(video: HTMLVideoElement, seconds: number) {
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: seconds,
  });
  fireEvent(video, new Event("durationchange"));
}

function receiveState(state: {
  playing: boolean;
  positionSeconds: number;
  videoId?: string;
  rate?: number;
  emittedAtMs?: number;
}) {
  const handler = socketHandlers.get("playback:state");
  expect(handler).toBeDefined();
  handler?.({ videoId: "video-1", emittedAtMs: Date.now(), rate: 1, ...state });
}

describe("RoomVideoPanel synced playback", () => {
  it("connects to the sync namespace with the session id", async () => {
    await renderPanel();
    expect(ioMock).toHaveBeenCalledWith(
      expect.stringContaining("/playback-sync"),
      expect.objectContaining({
        withCredentials: true,
        auth: { sessionId: "session-1" },
      }),
    );
  });

  it("applies a remote paused state to the local player", async () => {
    const { video } = await renderPanel();
    receiveState({ playing: false, positionSeconds: 42 });
    expect(video.currentTime).toBe(42);
  });

  it("publishes local gestures as full-state snapshots", async () => {
    const { video } = await renderPanel();
    video.currentTime = 10;
    fireEvent(video, new Event("seeked"));
    expect(socketEmit).toHaveBeenCalledWith(
      "playback:publish",
      expect.objectContaining({
        videoId: "video-1",
        playing: false,
        positionSeconds: 10,
      }),
    );
  });

  it("publishes the rate picked in the speed menu and applies a remote one", async () => {
    const { video } = await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Playback speed: 1×" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "0.5×" }));
    expect(video.playbackRate).toBe(0.5);
    fireEvent(video, new Event("ratechange"));
    expect(socketEmit).toHaveBeenCalledWith(
      "playback:publish",
      expect.objectContaining({ rate: 0.5 }),
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Playback speed: 0.5×" }),
    ).toBeInTheDocument();

    socketEmit.mockClear();
    receiveState({ playing: false, positionSeconds: 12, rate: 0.25 });
    expect(video.playbackRate).toBe(0.25);
    // The ratechange we caused must not be echoed back to the peer.
    fireEvent(video, new Event("ratechange"));
    expect(socketEmit).not.toHaveBeenCalledWith(
      "playback:publish",
      expect.anything(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Playback speed: 0.25×" }),
    );
    expect(
      screen.getByRole("menuitemradio", { name: "0.25×" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("shows a non-preset shared rate on the menu trigger", async () => {
    const { video } = await renderPanel();
    receiveState({ playing: false, positionSeconds: 3, rate: 1.75 });
    fireEvent(video, new Event("ratechange"));
    expect(screen.getByText("1.75×")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Playback speed: 1.75×" }),
    );
    for (const item of screen.getAllByRole("menuitemradio")) {
      expect(item).toHaveAttribute("aria-checked", "false");
    }
  });

  it("detaches on toggle off and snaps back on toggle on", async () => {
    const { video } = await renderPanel();
    receiveState({ playing: false, positionSeconds: 30 });
    expect(video.currentTime).toBe(30);

    const toggle = screen.getByRole("button", { name: /synced/i });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);

    // Detached: remote states are ignored, local gestures are not published.
    receiveState({ playing: false, positionSeconds: 90 });
    expect(video.currentTime).toBe(30);
    video.currentTime = 55;
    fireEvent(video, new Event("seeked"));
    expect(socketEmit).not.toHaveBeenCalledWith(
      "playback:publish",
      expect.anything(),
    );

    // Re-attach: snaps to the last shared state and asks for a fresh one.
    fireEvent.click(screen.getByRole("button", { name: /sync off/i }));
    expect(video.currentTime).toBe(90);
    expect(socketEmit).toHaveBeenCalledWith("playback:request-state");
  });

  it("shows the resume overlay when autoplay is blocked and recovers on tap", async () => {
    const { video } = await renderPanel();
    playMock.mockRejectedValueOnce(new Error("NotAllowedError"));
    receiveState({ playing: true, positionSeconds: 5 });

    const overlay = await screen.findByRole("button", {
      name: /resume synced playback/i,
    });
    expect(playMock).toHaveBeenCalledTimes(1);

    playMock.mockResolvedValue(undefined);
    fireEvent.click(overlay);
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2));
    expect(video.currentTime).toBeGreaterThanOrEqual(5);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /resume synced playback/i }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("RoomVideoPanel review player bar", () => {
  it("replaces the native controls", async () => {
    const { video } = await renderPanel();
    expect(video).not.toHaveAttribute("controls");
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("steps one frame at the clip's frame rate, pausing first", async () => {
    const { video } = await renderPanel();
    setDuration(video, 300);
    video.currentTime = 10;
    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(Math.floor(video.currentTime * 30)).toBe(301);

    fireEvent.click(screen.getByRole("button", { name: "Previous frame" }));
    expect(Math.floor(video.currentTime * 30)).toBe(300);
  });

  it("falls back to the default rate for a clip without a probed one", async () => {
    const { video } = await renderPanel([CLIPS[1]]);
    setDuration(video, 45);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    expect(Math.floor(video.currentTime * 30)).toBe(31);
  });

  it("seeks once when a scrub drag is released and at once from the keyboard", async () => {
    const { video } = await renderPanel();
    setDuration(video, 300);
    const slider = screen.getByRole("slider", { name: "Timeline" });

    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.change(slider, { target: { value: "50" } });
    expect(video.currentTime).toBe(0);
    fireEvent.pointerUp(slider);
    expect(video.currentTime).toBe(50);

    fireEvent.change(slider, { target: { value: "70" } });
    expect(video.currentTime).toBe(70);
  });

  it("restarts the clip at its end while loop is on", async () => {
    const { video } = await renderPanel();
    setDuration(video, 300);
    fireEvent(video, new Event("ended"));
    expect(playMock).not.toHaveBeenCalled();

    const loop = screen.getByRole("button", { name: "Loop" });
    fireEvent.click(loop);
    expect(loop).toHaveAttribute("aria-pressed", "true");
    video.currentTime = 300;
    fireEvent(video, new Event("ended"));
    expect(video.currentTime).toBe(0);
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("requests full screen for the video card", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    const { video } = await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    const card = requestFullscreen.mock.contexts[0] as HTMLElement;
    expect(card.contains(video)).toBe(true);
    delete (HTMLElement.prototype as { requestFullscreen?: unknown })
      .requestFullscreen;
  });

  it("reports the clip's aspect ratio from the probe, then from the media", async () => {
    const onAspectChange = vi.fn();
    const { video } = await renderPanel(CLIPS.slice(0, 1), { onAspectChange });
    expect(onAspectChange).toHaveBeenLastCalledWith(1920 / 1080);
    Object.defineProperty(video, "videoWidth", { value: 1080 });
    Object.defineProperty(video, "videoHeight", { value: 1920 });
    fireEvent(video, new Event("loadedmetadata"));
    await waitFor(() =>
      expect(onAspectChange).toHaveBeenLastCalledWith(1080 / 1920),
    );
  });
});

describe("RoomVideoPanel clips", () => {
  it("shows no tabs for a single clip and tabs with the note for several", async () => {
    await renderPanel();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("switches clips locally and publishes the switch as a paused snapshot", async () => {
    const { container } = await renderPanel(CLIPS);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "1. Match footage",
      "2. Serve drill",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/— serve/)).toBeInTheDocument();
    expect(socketEmit).toHaveBeenCalledWith(
      "playback:publish",
      expect.objectContaining({
        videoId: "video-2",
        playing: false,
        positionSeconds: 0,
      }),
    );
    // The second clip's playback URL is requested once it becomes active.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/videos/video-2/playback-url"),
        expect.anything(),
      ),
    );
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("follows the peer to another clip and applies the state once the source loads", async () => {
    const { container } = await renderPanel(CLIPS);
    socketEmit.mockClear();
    receiveState({ videoId: "video-2", playing: false, positionSeconds: 7 });
    const tabs = screen.getAllByRole("tab");
    await waitFor(() =>
      expect(tabs[1]).toHaveAttribute("aria-selected", "true"),
    );
    // Following the peer is not echoed back as a new command.
    expect(socketEmit).not.toHaveBeenCalledWith(
      "playback:publish",
      expect.anything(),
    );
    const video = (await waitFor(() => {
      const el = container.querySelector("video");
      expect(el?.getAttribute("src")).toContain("cdn.example");
      return el;
    })) as HTMLVideoElement;
    fireEvent(video, new Event("loadedmetadata"));
    expect(video.currentTime).toBe(7);
  });

  it("ignores a shared state naming a clip that is not attached", async () => {
    await renderPanel(CLIPS);
    receiveState({ videoId: "video-9", playing: false, positionSeconds: 7 });
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("RoomVideoPanel annotations", () => {
  const lineStroke = (id: string, authorId: string, momentKey = "134.2") => ({
    id,
    videoId: "video-1",
    momentKey,
    authorId,
    tool: "line" as const,
    color: "#2563eb",
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.9 },
    ],
    createdAtMs: 1,
  });

  async function receiveAnnotationState(
    clip: Record<string, unknown[]>,
    videoId = "video-1",
  ) {
    await waitFor(() =>
      expect(socketHandlers.get("annotation:state")).toBeDefined(),
    );
    socketHandlers.get("annotation:state")?.({ [videoId]: clip });
  }

  it("lists annotated moments and seeks to them, pausing the player", async () => {
    const { video } = await renderPanel();
    await receiveAnnotationState({
      "134.2": [lineStroke("s1", "coach-1")],
      "34.0": [lineStroke("s2", "player-1", "34.0")],
    });
    const group = await screen.findByRole("group", {
      name: "Annotated moments",
    });
    const chips = group.querySelectorAll("button");
    expect([...chips].map((c) => c.textContent)).toEqual(["0:34", "2:14.2"]);

    fireEvent.click(chips[1]);
    expect(video.currentTime).toBeCloseTo(134.2);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("marks annotated moments on the timeline and seeks from a marker", async () => {
    const { video } = await renderPanel();
    setDuration(video, 300);
    await receiveAnnotationState({
      "11.0": [lineStroke("s1", "coach-1", "11.0")],
    });
    const markers = await screen.findByRole("group", {
      name: "Annotated moments on the timeline",
    });
    const marker = markers.querySelector("button") as HTMLButtonElement;
    expect(marker).toHaveAttribute("aria-label", "Jump to 0:11");
    expect(marker.style.left).toBe(`${(11 / 300) * 100}%`);
    fireEvent.click(marker);
    expect(video.currentTime).toBe(11);
  });

  it("rebinds the layer to the replaced <video> when switching back to a cached clip", async () => {
    const { container } = await renderPanel(CLIPS);
    const firstVideo = container.querySelector("video");
    const firstLayer = screen.getByTestId("annotation-layer");
    const tabs = screen.getAllByRole("tab");

    fireEvent.click(tabs[1]);
    await waitFor(() =>
      expect(container.querySelector("video")).not.toBe(firstVideo),
    );
    // Back to the first clip: its URL is cached, so the card never shows the
    // loading state and the <video> is replaced in place.
    fireEvent.click(tabs[0]);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).not.toBe(firstVideo);
    expect(screen.getByTestId("annotation-layer")).not.toBe(firstLayer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pauses the video when a drawing tool is activated and exits on Escape", async () => {
    const { video } = await renderPanel();
    Object.defineProperty(video, "paused", {
      configurable: true,
      value: false,
    });
    const pen = screen.getByRole("button", { name: /pen/i });
    fireEvent.click(pen);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(pen).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(pen).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /select/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("undoes only this user's stroke on the shown moment", async () => {
    const { video } = await renderPanel();
    video.currentTime = 134.2;
    fireEvent(video, new Event("seeked"));
    await receiveAnnotationState({
      "134.2": [
        lineStroke("mine", "coach-1"),
        lineStroke("theirs", "player-1"),
      ],
    });
    const undo = await screen.findByRole("button", { name: /undo/i });
    await waitFor(() => expect(undo).toBeEnabled());
    fireEvent.click(undo);
    expect(socketEmit).toHaveBeenCalledWith("annotation:undo", {
      videoId: "video-1",
      momentKey: "134.2",
    });
    // Only the peer's stroke is left, so undo is no longer available.
    await waitFor(() => expect(undo).toBeDisabled());
    expect(screen.getByRole("button", { name: /clear/i })).toBeEnabled();
  });

  it("shows only the active clip's moments and keeps the other clip's strokes", async () => {
    await renderPanel(CLIPS);
    await waitFor(() =>
      expect(socketHandlers.get("annotation:state")).toBeDefined(),
    );
    socketHandlers.get("annotation:state")?.({
      "video-1": { "10.0": [lineStroke("s1", "coach-1", "10.0")] },
      "video-2": {
        "20.0": [
          { ...lineStroke("s2", "coach-1", "20.0"), videoId: "video-2" },
        ],
      },
    });
    const group = await screen.findByRole("group", {
      name: "Annotated moments",
    });
    expect(
      [...group.querySelectorAll("button")].map((c) => c.textContent),
    ).toEqual(["0:10"]);

    fireEvent.click(screen.getAllByRole("tab")[1]);
    await waitFor(() =>
      expect(
        [
          ...screen
            .getByRole("group", { name: "Annotated moments" })
            .querySelectorAll("button"),
        ].map((c) => c.textContent),
      ).toEqual(["0:20"]),
    );
  });

  it("uses the role default color", async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    const swatches = screen.getAllByRole("radio");
    expect(swatches[0]).toHaveAttribute("aria-label", "#2563eb");
    expect(swatches[0]).toHaveAttribute("aria-checked", "true");
  });
});
