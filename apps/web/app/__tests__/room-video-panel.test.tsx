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

async function renderPanel() {
  const utils = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RoomVideoPanel
        sessionId="session-1"
        videoId="video-1"
        videoTitle="Match footage"
        userId="coach-1"
        role={Role.Professional}
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

function receiveState(state: {
  playing: boolean;
  positionSeconds: number;
  emittedAtMs?: number;
}) {
  const handler = socketHandlers.get("playback:state");
  expect(handler).toBeDefined();
  handler?.({ emittedAtMs: Date.now(), ...state });
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
      expect.objectContaining({ playing: false, positionSeconds: 10 }),
    );
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

describe("RoomVideoPanel annotations", () => {
  const lineStroke = (id: string, authorId: string, momentKey = "134.2") => ({
    id,
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

  async function receiveAnnotationState(state: Record<string, unknown[]>) {
    await waitFor(() =>
      expect(socketHandlers.get("annotation:state")).toBeDefined(),
    );
    socketHandlers.get("annotation:state")?.(state);
  }

  it("lists annotated moments and seeks to them, pausing the player", async () => {
    const { video } = await renderPanel();
    await receiveAnnotationState({
      "134.2": [lineStroke("s1", "coach-1")],
      "34.0": [lineStroke("s2", "player-1", "34.0")],
    });
    const group = await screen.findByRole("group", {
      name: /annotated moments/i,
    });
    const chips = group.querySelectorAll("button");
    expect([...chips].map((c) => c.textContent)).toEqual(["0:34", "2:14.2"]);

    fireEvent.click(chips[1]);
    expect(video.currentTime).toBeCloseTo(134.2);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
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
      momentKey: "134.2",
    });
    // Only the peer's stroke is left, so undo is no longer available.
    await waitFor(() => expect(undo).toBeDisabled());
    expect(screen.getByRole("button", { name: /clear/i })).toBeEnabled();
  });

  it("uses the role default color", async () => {
    await renderPanel();
    const swatches = screen.getAllByRole("radio");
    expect(swatches[0]).toHaveAttribute("aria-label", "#2563eb");
    expect(swatches[0]).toHaveAttribute("aria-checked", "true");
  });
});
