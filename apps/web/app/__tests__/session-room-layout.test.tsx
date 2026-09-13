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

const { roomMounts, disconnect, apiFetch } = vi.hoisted(() => ({
  roomMounts: vi.fn(),
  disconnect: vi.fn(),
  apiFetch: vi.fn(),
}));

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

vi.mock("@/components/sessions/room-video-panel", () => ({
  RoomVideoPanel: () => <div data-testid="video-panel" />,
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
    expect(roomMounts).toHaveBeenCalledTimes(1);
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
