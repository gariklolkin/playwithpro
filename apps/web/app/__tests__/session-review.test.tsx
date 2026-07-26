import { fireEvent, render, screen } from "@testing-library/react";
import {
  DisputeOutcome,
  DisputeStatus,
  PaymentStatus,
  ServiceType,
  SessionStatus,
  type SessionResponse,
} from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { SessionReview } from "@/components/sessions/session-review";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const completedSession: SessionResponse = {
  id: "session-1",
  status: SessionStatus.CompletedPaid,
  serviceType: ServiceType.Consultation,
  priceMinor: 4005,
  currency: "EUR",
  startsAt: new Date("2026-07-20T10:00:00Z").toISOString(),
  endsAt: new Date("2026-07-20T11:00:00Z").toISOString(),
  expiresAt: null,
  coach: { id: "profile-1", displayName: "Coach", avatarUrl: null },
  player: { id: "player-1", displayName: "Player", avatarUrl: null },
  videoId: null,
  videoTitle: null,
  venue: null,
  room: null,
  autoConfirmAt: null,
  playerConfirmedAt: new Date("2026-07-20T12:00:00Z").toISOString(),
  coachConfirmedAt: null,
  escrow: PaymentStatus.Released,
  dispute: null,
  review: null,
  reviewable: true,
  createdAt: new Date("2026-07-19T10:00:00Z").toISOString(),
};

function renderReview(session: SessionResponse, isCoach = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionReview session={session} isCoach={isCoach} />
    </NextIntlClientProvider>,
  );
}

describe("SessionReview", () => {
  it("submits rating and text, then refreshes the list", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderReview(completedSession);

    fireEvent.click(screen.getByRole("button", { name: /leave a review/i }));
    fireEvent.click(screen.getByRole("radio", { name: "4 of 5 stars" }));
    fireEvent.change(screen.getByPlaceholderText(/share a few words/i), {
      target: { value: "Great tips" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sessions/session-1/review");
    expect(JSON.parse(init.body as string)).toEqual({
      rating: 4,
      text: "Great tips",
    });
  });

  it("keeps submit disabled until a rating is picked", () => {
    renderReview(completedSession);

    fireEvent.click(screen.getByRole("button", { name: /leave a review/i }));

    expect(
      screen.getByRole("button", { name: /submit review/i }),
    ).toBeDisabled();
  });

  it("omits empty text from the request", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderReview(completedSession);

    fireEvent.click(screen.getByRole("button", { name: /leave a review/i }));
    fireEvent.click(screen.getByRole("radio", { name: "5 of 5 stars" }));
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ rating: 5 });
  });

  it("shows an error and keeps the form on failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409 });
    renderReview(completedSession);

    fireEvent.click(screen.getByRole("button", { name: /leave a review/i }));
    fireEvent.click(screen.getByRole("radio", { name: "3 of 5 stars" }));
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));

    expect(
      await screen.findByText(/something went wrong/i),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the given stars instead of the CTA once reviewed", () => {
    renderReview({
      ...completedSession,
      reviewable: false,
      review: {
        rating: 4,
        text: "Solid",
        createdAt: new Date("2026-07-21T10:00:00Z").toISOString(),
      },
    });

    expect(screen.getByText(/your review/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /leave a review/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the received rating to the coach without any CTA", () => {
    renderReview(
      {
        ...completedSession,
        reviewable: false,
        review: {
          rating: 5,
          text: null,
          createdAt: new Date("2026-07-21T10:00:00Z").toISOString(),
        },
      },
      true,
    );

    expect(screen.getByText(/player's review/i)).toBeInTheDocument();
  });

  it("offers nothing to the coach on an unreviewed session", () => {
    const { container } = renderReview(completedSession, true);

    expect(container).toBeEmptyDOMElement();
  });

  it("offers nothing on a refunded resolution", () => {
    const { container } = renderReview({
      ...completedSession,
      status: SessionStatus.Resolved,
      escrow: PaymentStatus.Refunded,
      dispute: {
        status: DisputeStatus.Resolved,
        reason: "No show",
        outcome: DisputeOutcome.Refund,
      },
      reviewable: false,
    });

    expect(container).toBeEmptyDOMElement();
  });
});
