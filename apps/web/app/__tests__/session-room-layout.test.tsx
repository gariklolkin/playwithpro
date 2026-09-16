import { Role, ServiceType } from "@playwithpro/shared";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { SessionRoom } from "@/components/sessions/session-room";

const { roomMounts, disconnect, apiFetch, switchDevice } = vi.hoisted(() => ({
  roomMounts: vi.fn(),
  disconnect: vi.fn(),
  apiFetch: vi.fn(),
  switchDevice: vi.fn(async () => undefined),
}));

const DEVICES: Record<string, { deviceId: string; label: string }[]> = {
  videoinput: [
    { deviceId: "cam-1", label: "FaceTime HD" },
    { deviceId: "cam-2", label: "iPhone Camera" },
  ],
  audioinput: [{ deviceId: "mic-1", label: "Built-in Microphone" }],
  audiooutput: [],
};

// The call SDK is replaced by inert hooks; LiveKitRoom counts its mounts so
// the tests can prove layout changes never reconnect.
vi.mock("@livekit/components-react", async () => {
  const React = await import("react");
  return {
    LiveKitRoom: ({ children }: { children: React.ReactNode }) => {
      React.useEffect(() => {
        roomMounts();
      }, []);
      return React.createElement(React.Fragment, null, children);
    },
    RoomAudioRenderer: () => null,
    VideoTrack: () => null,
    isTrackReference: () => false,
    useConnectionQualityIndicator: () => ({ quality: "unknown" }),
    useConnectionState: () => "connected",
    useLocalParticipant: () => ({
      isCameraEnabled: true,
      isMicrophoneEnabled: true,
      localParticipant: {},
    }),
    useRemoteParticipants: () => [{ identity: "coach-1" }],
    useRoomContext: () => ({
      localParticipant: { identity: "player-1" },
      disconnect,
    }),
    useTrackToggle: () => ({ enabled: true, pending: false, toggle: vi.fn() }),
    useTracks: () => [],
    useMediaDeviceSelect: ({ kind }: { kind: string }) => ({
      devices: DEVICES[kind] ?? [],
      activeDeviceId: DEVICES[kind]?.[0]?.deviceId ?? "",
      setActiveMediaDevice: switchDevice,
      className: "",
    }),
  };
});

vi.mock("livekit-client", () => ({
  ConnectionQuality: {
    Excellent: "excellent",
    Good: "good",
    Poor: "poor",
    Lost: "lost",
    Unknown: "unknown",
  },
  ConnectionState: {
    Connecting: "connecting",
    Connected: "connected",
    Reconnecting: "reconnecting",
    Disconnected: "disconnected",
  },
  MediaDeviceFailure: { getFailure: () => undefined },
  Track: {
    Source: {
      Camera: "camera",
      Microphone: "microphone",
      ScreenShare: "screen_share",
    },
  },
}));

vi.mock("@/components/sessions/call-prejoin", () => ({
  CallPreJoin: ({
    onJoin,
  }: {
    onJoin: (choices: {
      audioEnabled: boolean;
      videoEnabled: boolean;
      audioDeviceId: string | null;
      videoDeviceId: string | null;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onJoin({
          audioEnabled: true,
          videoEnabled: true,
          audioDeviceId: null,
          videoDeviceId: null,
        })
      }
    >
      Join (stub)
    </button>
  ),
}));

// Load the real call component synchronously instead of via next/dynamic.
vi.mock("next/dynamic", async () => {
  const call = await import("@/components/sessions/livekit-room");
  return { default: () => call.LiveKitCall };
});

// The clip panel stub can announce a portrait clip, like the real one does
// from the probe or the loaded metadata.
vi.mock("@/components/sessions/room-video-panel", () => ({
  RoomVideoPanel: ({
    onAspectChange,
  }: {
    onAspectChange?: (aspect: number) => void;
  }) => (
    <div data-testid="video-panel">
      <button type="button" onClick={() => onAspectChange?.(9 / 16)}>
        Portrait clip (stub)
      </button>
    </div>
  ),
}));

vi.mock("@/components/catalog/local-time", () => ({
  LocalTime: ({ iso }: { iso: string }) => <span>{iso}</span>,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));

function roomResponse(serviceType: ServiceType) {
  const now = Date.now();
  return {
    sessionId: "session-1",
    status: "in_progress",
    serviceType,
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 3_600_000).toISOString(),
    opensAt: new Date(now - 900_000).toISOString(),
    closesAt: new Date(now + 5_400_000).toISOString(),
    room: { kind: "livekit", url: "ws://livekit.test" },
    videos:
      serviceType === ServiceType.VideoAnalysis
        ? [
            {
              videoId: "video-1",
              title: "Match footage",
              note: null,
              durationSeconds: 20,
              fps: 30,
              width: 1920,
              height: 1080,
              position: 0,
            },
          ]
        : [],
    counterpartName: "Smoke Coach",
    serverNow: new Date(now).toISOString(),
  };
}

function mockApi(serviceType: ServiceType) {
  apiFetch.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      url.endsWith("/room/join")
        ? { attendanceId: "attendance-1", token: "token-1" }
        : roomResponse(serviceType),
  }));
}

function renderRoom() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionRoom
        sessionId="session-1"
        userId="player-1"
        role={Role.Amateur}
        displayName="Smoke Player"
      />
    </NextIntlClientProvider>,
  );
}

async function joinCall() {
  fireEvent.click(await screen.findByRole("button", { name: "Join (stub)" }));
  await waitFor(() =>
    expect(screen.getByTestId("room-layout")).not.toHaveAttribute(
      "data-layout",
      "stage",
    ),
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SessionRoom video-analysis layout", () => {
  it("keeps the pre-join split and switches to the presence rail after joining", async () => {
    mockApi(ServiceType.VideoAnalysis);
    renderRoom();
    await screen.findByRole("button", { name: "Join (stub)" });
    const layout = screen.getByTestId("room-layout");
    expect(layout).toHaveAttribute("data-layout", "stage");
    expect(layout.className).toContain("grid-cols-2");
    expect(screen.getByTestId("video-panel")).toBeInTheDocument();

    await joinCall();
    expect(layout).toHaveAttribute("data-layout", "rail");
    // The square-bracket arbitrary-property spelling is dropped by Tailwind 4.
    expect(layout.className).toContain("min-[1000px]:grid-cols-(--card-cols)");
    expect(layout.style.getPropertyValue("--card-cols")).toContain(
      "minmax(260px, 1fr)",
    );
    expect(screen.getByTestId("rail-counterpart")).toHaveTextContent(
      "Smoke Coach",
    );
    expect(screen.getByTestId("rail-self")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
  });

  it("hides the own tile and remembers the choice in this browser", async () => {
    mockApi(ServiceType.VideoAnalysis);
    const first = renderRoom();
    await joinCall();
    fireEvent.click(
      screen.getByRole("button", { name: "Hide my camera tile" }),
    );
    expect(screen.queryByTestId("rail-self")).not.toBeInTheDocument();
    expect(screen.getByTestId("rail-counterpart")).toBeInTheDocument();
    expect(window.localStorage.getItem("pwp.room.hideSelf")).toBe("1");
    first.unmount();

    renderRoom();
    await joinCall();
    expect(screen.queryByTestId("rail-self")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show my camera tile" }),
    );
    expect(screen.getByTestId("rail-self")).toBeInTheDocument();
    expect(window.localStorage.getItem("pwp.room.hideSelf")).toBeNull();
  });

  it("focus hides the tiles but keeps mic, leave and exit — without reconnecting", async () => {
    mockApi(ServiceType.VideoAnalysis);
    renderRoom();
    await joinCall();
    // The mount effect flushes after the commit `joinCall` waited for.
    await waitFor(() => expect(roomMounts).toHaveBeenCalledTimes(1));
    const layout = screen.getByTestId("room-layout");

    fireEvent.click(screen.getByRole("button", { name: "Focus on the video" }));
    expect(layout).toHaveAttribute("data-layout", "focus");
    expect(layout.style.getPropertyValue("--card-cols")).toBe("minmax(0, 1fr)");
    expect(screen.queryByTestId("rail-counterpart")).not.toBeInTheDocument();
    const bar = screen.getByRole("group", { name: "On call" });
    expect(
      within(bar).getByRole("button", { name: "Mute microphone" }),
    ).toBeInTheDocument();
    expect(
      within(bar).getByRole("button", { name: "Leave" }),
    ).toBeInTheDocument();

    fireEvent.click(within(bar).getByRole("button", { name: "Show the call" }));
    expect(layout).toHaveAttribute("data-layout", "rail");
    fireEvent.click(
      screen.getByRole("button", { name: "Hide my camera tile" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Focus on the video" }));
    fireEvent.click(screen.getByRole("button", { name: "Show the call" }));

    expect(roomMounts).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(
      apiFetch.mock.calls.filter(([url]) => String(url).endsWith("/room/join")),
    ).toHaveLength(1);
  });

  it("gives a portrait clip a taller, narrower card with a capped, centred rail", async () => {
    mockApi(ServiceType.VideoAnalysis);
    renderRoom();
    await joinCall();
    const layout = screen.getByTestId("room-layout");
    expect(layout).toHaveAttribute("data-orientation", "landscape");
    expect(layout.style.getPropertyValue("--frame-h")).toBe("min(520px, 62vh)");
    expect(layout.style.getPropertyValue("--card-cols")).toContain("560px");
    expect(layout.className).not.toContain("justify-center");

    fireEvent.click(
      screen.getByRole("button", { name: "Portrait clip (stub)" }),
    );
    expect(layout).toHaveAttribute("data-orientation", "portrait");
    expect(layout.style.getPropertyValue("--frame-h")).toBe("min(880px, 80vh)");
    const cols = layout.style.getPropertyValue("--card-cols");
    expect(cols).toContain("min(400px,");
    expect(cols).toContain("calc(min(880px, 80vh) * 0.5625)");
    expect(cols).toContain("minmax(260px, 420px)");
    expect(cols).not.toContain("1fr");
    expect(layout.className).toContain("min-[1000px]:justify-center");

    // Focus keeps the taller frame idea but takes the whole column.
    fireEvent.click(screen.getByRole("button", { name: "Focus on the video" }));
    expect(layout.style.getPropertyValue("--card-cols")).toBe("minmax(0, 1fr)");
    expect(layout.className).not.toContain("justify-center");
  });

  it("switches devices from the in-call menu without reconnecting", async () => {
    mockApi(ServiceType.VideoAnalysis);
    renderRoom();
    await joinCall();
    expect(roomMounts).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Devices" }));
    const dialog = screen.getByRole("dialog", {
      name: "Camera, microphone and speaker",
    });
    const camera = within(dialog).getByLabelText("Camera");
    expect(
      within(camera)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["FaceTime HD", "iPhone Camera"]);
    expect(within(dialog).getByLabelText("Microphone")).toBeInTheDocument();
    // No output devices listed → no speaker picker.
    expect(within(dialog).queryByLabelText("Speaker")).not.toBeInTheDocument();

    fireEvent.change(camera, { target: { value: "cam-2" } });
    expect(switchDevice).toHaveBeenCalledWith("cam-2");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Camera, microphone and speaker" }),
    ).not.toBeInTheDocument();

    // Also reachable from the focus bar.
    fireEvent.click(screen.getByRole("button", { name: "Focus on the video" }));
    const bar = screen.getByRole("group", { name: "On call" });
    fireEvent.click(within(bar).getByRole("button", { name: "Devices" }));
    expect(
      screen.getByRole("dialog", { name: "Camera, microphone and speaker" }),
    ).toBeInTheDocument();

    expect(roomMounts).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(
      apiFetch.mock.calls.filter(([url]) => String(url).endsWith("/room/join")),
    ).toHaveLength(1);
  });

  it("leaves focus when the party leaves the call", async () => {
    mockApi(ServiceType.VideoAnalysis);
    renderRoom();
    await joinCall();
    fireEvent.click(screen.getByRole("button", { name: "Focus on the video" }));
    const bar = screen.getByRole("group", { name: "On call" });
    await act(async () => {
      fireEvent.click(within(bar).getByRole("button", { name: "Leave" }));
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("SessionRoom consultation layout", () => {
  it("keeps the stage call without a rail or video panel", async () => {
    mockApi(ServiceType.Consultation);
    renderRoom();
    await joinCall();
    const layout = screen.getByTestId("room-layout");
    expect(layout).toHaveAttribute("data-layout", "consultation");
    expect(screen.queryByTestId("video-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rail-counterpart")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Focus on the video" }),
    ).not.toBeInTheDocument();
  });
});

describe("SessionRoom call-time indicator and reminders", () => {
  it("shows the remaining time in stage, rail and focus layouts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockApi(ServiceType.VideoAnalysis);
      renderRoom();
      await screen.findByRole("button", { name: "Join (stub)" });
      const indicator = await screen.findByTestId("room-time");
      expect(indicator).toHaveAttribute("data-phase", "during");
      expect(indicator).toHaveTextContent(/59:5\d left/);

      await joinCall();
      expect(screen.getByTestId("room-time")).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "Focus on the video" }),
      );
      expect(screen.getByTestId("room-layout")).toHaveAttribute(
        "data-layout",
        "focus",
      );
      expect(screen.getByTestId("room-time")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("toasts at T-10 and T-0 only while in the call, inside a fullscreen card", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const now = Date.now();
      apiFetch.mockImplementation(async (url: string) => ({
        ok: true,
        json: async () =>
          url.endsWith("/room/join")
            ? { attendanceId: "attendance-1", token: "token-1" }
            : {
                ...roomResponse(ServiceType.Consultation),
                startsAt: new Date(now - 60_000).toISOString(),
                endsAt: new Date(now + 11 * 60_000).toISOString(),
                closesAt: new Date(now + 41 * 60_000).toISOString(),
              },
      }));
      renderRoom();
      await screen.findByRole("button", { name: "Join (stub)" });
      // Flush the clock's effects (server offset, first tick) before moving
      // the fake clock; `findByRole` resolves on the commit, not on them.
      await act(async () => {});
      // Pre-join: crossing T-10 must not toast.
      await act(async () => {
        vi.advanceTimersByTime(90_000);
      });
      expect(screen.queryByTestId("room-toast")).not.toBeInTheDocument();

      await joinCall();
      await act(async () => {});
      const card = document.createElement("div");
      document.body.appendChild(card);
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: card,
      });
      act(() => {
        document.dispatchEvent(new Event("fullscreenchange"));
      });

      // T-0 is reached ~9.5 minutes later.
      await act(async () => {
        vi.advanceTimersByTime(10 * 60_000);
      });
      const toast = await screen.findByTestId("room-toast");
      expect(toast).toHaveTextContent("Time is up");
      expect(card).toContainElement(toast);
      expect(screen.getByTestId("room-time")).toHaveAttribute(
        "data-phase",
        "over",
      );
      expect(disconnect).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByTestId("room-toast")).not.toBeInTheDocument();
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      });
      card.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
