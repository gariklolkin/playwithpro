import { fireEvent, render, screen } from "@testing-library/react";
import {
  ProProfileStatus,
  VerificationState,
  type AdminVerificationItem,
} from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { VerificationQueue } from "@/components/admin/verification-queue";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const item: AdminVerificationItem = {
  requestId: "req-1",
  submittedAt: new Date("2026-07-18T10:00:00Z").toISOString(),
  credentials: "ITTF licensed coach",
  state: VerificationState.AwaitingScheduling,
  meeting: null,
  profile: {
    id: "profile-1",
    status: ProProfileStatus.PendingReview,
    bio: "20 years of coaching",
    languages: ["en", "de"],
    services: [
      {
        type: "consultation" as never,
        priceMinor: 4000,
        currency: "EUR",
        venueLabel: "",
        venueLat: null,
        venueLng: null,
        active: true,
      },
    ],
    latestVerification: null,
  },
  user: { id: "user-1", email: "coach@example.com", displayName: "Coach Ma" },
};

function renderQueue(items: AdminVerificationItem[] = [item]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VerificationQueue initialItems={items} />
    </NextIntlClientProvider>,
  );
}

describe("VerificationQueue", () => {
  it("requires a note to reject", async () => {
    renderQueue();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(
      await screen.findByText("Add a note before rejecting."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("approves a request and removes it from the queue", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    renderQueue();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("No pending requests.")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/admin/verification-requests/req-1/approve"),
    );
    expect(call).toBeDefined();
  });

  it("rejects with the note and removes the item", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    renderQueue();

    fireEvent.change(screen.getByPlaceholderText(/Reason shown to the pro/), {
      target: { value: "Links do not open" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(await screen.findByText("No pending requests.")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/admin/verification-requests/req-1/reject"),
    );
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      note: "Links do not open",
    });
  });

  it("shows an empty state when the queue is clear", () => {
    renderQueue([]);

    expect(screen.getByText("No pending requests.")).toBeInTheDocument();
  });

  it("shows the request state instead of messenger contacts", () => {
    renderQueue();

    expect(screen.getByText("Awaiting scheduling")).toBeInTheDocument();
    expect(screen.queryByText(/Telegram/)).not.toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp/)).not.toBeInTheDocument();
  });

  it("shows the meeting time and join link for a scheduled request", () => {
    renderQueue([
      {
        ...item,
        state: VerificationState.Scheduled,
        meeting: {
          bookingId: "booking-1",
          startsAt: new Date("2026-07-21T12:30:00Z").toISOString(),
          endsAt: new Date("2026-07-21T12:45:00Z").toISOString(),
          meetUrl: "https://meet.jit.si/PlayWithProVerify-booking-1",
        },
      },
    ]);

    expect(screen.getByRole("link", { name: "Join meeting" })).toHaveAttribute(
      "href",
      "https://meet.jit.si/PlayWithProVerify-booking-1",
    );
  });
});
