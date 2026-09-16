import {
  PaymentStatus,
  ServiceType,
  SessionStatus,
  type SessionResponse,
} from "@playwithpro/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { SessionsList } from "@/components/sessions/sessions-list";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const HOUR = 3_600_000;

const session: SessionResponse = {
  id: "session-1",
  status: SessionStatus.PaidEscrow,
  serviceType: ServiceType.VideoAnalysis,
  priceMinor: 6000,
  currency: "EUR",
  startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
  endsAt: new Date(Date.now() + 25 * HOUR).toISOString(),
  expiresAt: null,
  coach: { id: "profile-1", displayName: "Coach", avatarUrl: null },
  player: { id: "player-1", displayName: "Player", avatarUrl: null },
  videos: [
    {
      videoId: "v1",
      title: "Match",
      note: null,
      durationSeconds: 600,
      fps: null,
      width: null,
      height: null,
      position: 0,
    },
    {
      videoId: "v2",
      title: "Serve",
      note: "second serve",
      durationSeconds: 45,
      fps: null,
      width: null,
      height: null,
      position: 1,
    },
  ],
  venue: null,
  room: null,
  autoConfirmAt: null,
  playerConfirmedAt: null,
  coachConfirmedAt: null,
  escrow: PaymentStatus.Held,
  dispute: null,
  review: null,
  reviewable: false,
  goal: null,
  playerContext: null,
  createdAt: new Date().toISOString(),
};

function renderList(item: SessionResponse, isCoach: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionsList upcoming={[item]} past={[]} isCoach={isCoach} />
    </NextIntlClientProvider>,
  );
}

describe("SessionsList clips", () => {
  it("lists the clips with notes and durations, linked for the coach of a paid session", () => {
    renderList(session, true);
    const match = screen.getByRole("link", { name: /Match/ });
    expect(match).toHaveAttribute(
      "href",
      expect.stringContaining("/videos/v1"),
    );
    expect(screen.getByText("— second serve")).toBeInTheDocument();
    expect(screen.getByText("0:45")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /edit clips/i }),
    ).not.toBeInTheDocument();
  });

  it("does not link clips of an unpaid session for the coach", () => {
    renderList({ ...session, status: SessionStatus.PendingPayment }, true);
    expect(
      screen.queryByRole("link", { name: /Match/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Match/)).toBeInTheDocument();
  });

  it("shows the removed notice when the clip set is empty", () => {
    renderList({ ...session, videos: [] }, false);
    expect(screen.getByText(/removed from the library/i)).toBeInTheDocument();
  });

  it("lets the player edit the clips before start and maps a cap rejection", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ reason: "too_many_clips", max: 5, count: 6 }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          videos: [
            {
              id: "v1",
              title: "Match",
              status: "ready",
              durationSeconds: 600,
              sizeBytes: 1,
              width: null,
              height: null,
              fps: null,
              codec: null,
              rejectionReason: null,
              expiresAt: null,
              attachedUpcomingSessions: 1,
              createdAt: "",
            },
          ],
          limits: {
            file: { maxSizeBytes: 1, maxDurationSeconds: 1 },
            session: { maxClips: 5, maxTotalSeconds: 3600 },
            library: { maxBytes: 1, maxVideos: 1, usedBytes: 0, count: 0 },
          },
        }),
      });
    });
    renderList(session, false);
    fireEvent.click(await screen.findByRole("button", { name: /edit clips/i }));
    await screen.findByRole("checkbox", { name: "Match" });
    fireEvent.click(screen.getByRole("button", { name: /save clips/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/at most 5 clips per session/i),
      ).toBeInTheDocument(),
    );
  });

  it("offers no editor once the session has started", () => {
    renderList(
      {
        ...session,
        status: SessionStatus.InProgress,
        startsAt: new Date(Date.now() - HOUR).toISOString(),
      },
      false,
    );
    expect(
      screen.queryByRole("button", { name: /edit clips/i }),
    ).not.toBeInTheDocument();
  });
});
