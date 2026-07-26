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
