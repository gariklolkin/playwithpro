import {
  PaymentStatus,
  PlayerLevel,
  ServiceType,
  SessionStatus,
  type PlayerCardResponse,
  type SessionResponse,
} from "@playwithpro/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { PlayerCard } from "@/components/players/player-card";
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

const card: PlayerCardResponse = {
  id: "pp-1",
  filled: true,
  level: PlayerLevel.Advanced,
  style: "offensive",
  yearsOfExperience: 7,
  handedness: "left",
  grip: "shakehand",
  about: "Working on my loop",
  userId: "player-1",
  displayName: "Anna",
  avatarUrl: null,
} as PlayerCardResponse;

const session: SessionResponse = {
  id: "session-1",
  status: SessionStatus.PaidEscrow,
  serviceType: ServiceType.Consultation,
  priceMinor: 4005,
  currency: "EUR",
  startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
  endsAt: new Date(Date.now() + 25 * HOUR).toISOString(),
  expiresAt: null,
  coach: { id: "profile-1", displayName: "Coach", avatarUrl: null },
  player: { id: "player-1", displayName: "Anna", avatarUrl: null },
  videos: [],
  goal: "Backhand loop against topspin",
  playerContext: card,
  venue: null,
  room: null,
  autoConfirmAt: null,
  playerConfirmedAt: null,
  coachConfirmedAt: null,
  coachGameAnswer: null,
  attendance: null,
  escrow: PaymentStatus.Held,
  dispute: null,
  review: null,
  reviewable: false,
  createdAt: new Date().toISOString(),
};

function renderList(item: SessionResponse, isCoach: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionsList upcoming={[item]} past={[]} isCoach={isCoach} />
    </NextIntlClientProvider>,
  );
}

describe("PlayerCard", () => {
  it("renders the facts, the about text and the goal slot", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlayerCard player={card} goal="Serve return" />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText(
        /Advanced · Offensive · 7 yrs of play · Left-handed · Shakehand/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Working on my loop")).toBeInTheDocument();
    expect(screen.getByText("Serve return")).toBeInTheDocument();
  });

  it("shows the unfilled state instead of the default level", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlayerCard
          player={{
            ...card,
            filled: false,
            level: PlayerLevel.Beginner,
            about: "",
          }}
          goal={null}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText("hasn't filled in a profile yet"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Beginner/)).not.toBeInTheDocument();
    expect(screen.getByText("No goal given.")).toBeInTheDocument();
  });
});

describe("SessionsList player context", () => {
  it("offers the coach a collapsed disclosure with the card and goal on a paid entry", () => {
    renderList(session, true);
    const disclosure = screen.getByTestId("player-context");
    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByText(/About the player/)).toBeInTheDocument();
    expect(
      screen.getByText("Backhand loop against topspin"),
    ).toBeInTheDocument();
    expect(screen.getByText("Working on my loop")).toBeInTheDocument();
    // The coach never gets the player's editor.
    expect(screen.queryByTestId("session-goal")).not.toBeInTheDocument();
  });

  it("offers no disclosure when the API embedded no card (unpaid entry)", () => {
    renderList(
      { ...session, status: SessionStatus.PendingPayment, playerContext: null },
      true,
    );
    expect(screen.queryByTestId("player-context")).not.toBeInTheDocument();
  });

  it("shows the player their goal and lets them edit it before start", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...session, goal: "Serve variety" }),
    });
    renderList({ ...session, playerContext: null }, false);

    expect(screen.queryByTestId("player-context")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Backhand loop against topspin/),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    fireEvent.change(
      screen.getByPlaceholderText(/backhand loop against topspin…/),
      {
        target: { value: "  Serve variety  " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save goal" }));

    await waitFor(() =>
      expect(screen.getByText(/Serve variety/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sessions/session-1/goal"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ goal: "Serve variety" }),
      }),
    );
  });

  it("freezes the goal once the session has started", async () => {
    renderList(
      {
        ...session,
        playerContext: null,
        status: SessionStatus.InProgress,
        startsAt: new Date(Date.now() - HOUR).toISOString(),
      },
      false,
    );
    expect(
      screen.getByText(/Backhand loop against topspin/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Edit/ }),
    ).not.toBeInTheDocument();
  });
});
