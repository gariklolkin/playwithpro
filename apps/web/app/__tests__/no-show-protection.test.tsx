import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  AttendanceOutcome,
  CoachGameAnswer,
  DisputeKind,
  DisputeReasonCategory,
  DisputeStatus,
  PaymentStatus,
  ServiceType,
  SessionStatus,
  type AdminDisputeItem,
  type AttendanceSummary,
  type DisputeSummary,
  type SessionResponse,
} from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import ruMessages from "../../messages/ru.json";
import { AdminDisputes } from "@/components/admin/admin-disputes";
import { SessionActions } from "@/components/sessions/session-actions";
import { WaitingNote } from "@/components/sessions/waiting-note";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();
const NOW = new Date("2026-09-20T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const attendance = (
  overrides: Partial<AttendanceSummary> = {},
): AttendanceSummary => ({
  playerFirstConnectedAt: "2026-09-20T10:00:00.000Z",
  coachFirstConnectedAt: "2026-09-20T10:01:00.000Z",
  overlapMinutes: 58,
  coachLateMinutes: 1,
  partial: false,
  outcome: AttendanceOutcome.Held,
  ...overrides,
});

const systemDispute = (
  overrides: Partial<DisputeSummary> = {},
): DisputeSummary => ({
  status: DisputeStatus.Open,
  kind: DisputeKind.CoachNoShow,
  reasonCategory: null,
  reason: null,
  outcome: null,
  responseDueAt: "2026-09-22T11:35:00.000Z",
  coachResponse: null,
  coachRespondedAt: null,
  resolvedVia: null,
  systemNote: null,
  ...overrides,
});

const awaiting: SessionResponse = {
  id: "session-1",
  status: SessionStatus.AwaitingConfirmation,
  serviceType: ServiceType.Consultation,
  priceMinor: 4005,
  currency: "EUR",
  startsAt: "2026-09-20T10:00:00.000Z",
  endsAt: "2026-09-20T11:00:00.000Z",
  expiresAt: null,
  coach: { id: "profile-1", displayName: "Coach Li", avatarUrl: null },
  player: { id: "player-1", displayName: "Anna", avatarUrl: null },
  videos: [],
  venue: null,
  room: null,
  autoConfirmAt: "2026-09-22T11:00:00.000Z",
  playerConfirmedAt: null,
  coachConfirmedAt: null,
  coachGameAnswer: null,
  attendance: attendance(),
  escrow: PaymentStatus.Held,
  dispute: null,
  review: null,
  reviewable: false,
  goal: null,
  playerContext: null,
  createdAt: "2026-09-19T10:00:00.000Z",
};

async function renderActions(
  session: SessionResponse,
  isCoach: boolean,
  locale: "en" | "ru" = "en",
) {
  const view = render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? messages : ruMessages}
      timeZone="UTC"
    >
      <SessionActions session={session} isCoach={isCoach} />
    </NextIntlClientProvider>,
  );
  // useNow publishes the clock on a deferred tick.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  return view;
}

const lastBody = () =>
  JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
const lastPath = () => String(fetchMock.mock.calls.at(-1)![0]);

describe("confirmation banner", () => {
  it("tells the player the coach was late before asking them to confirm", async () => {
    const { container } = await renderActions(
      {
        ...awaiting,
        attendance: attendance({ coachLateMinutes: 18, partial: true }),
      },
      false,
    );

    const evidence = screen.getByTestId("attendance-evidence");
    expect(evidence.textContent).toBe("Coach Li joined 18 minutes late.");
    const text = container.textContent ?? "";
    expect(text.indexOf("18 minutes late")).toBeLessThan(
      text.indexOf("Did this session take place?"),
    );
    expect(
      screen.getByRole("button", { name: /Confirm session/ }),
    ).toBeTruthy();
  });

  it("says nothing when both came on time", async () => {
    await renderActions(awaiting, false);
    expect(screen.queryByTestId("attendance-evidence")).toBeNull();
  });

  it("reassures a coach whose player never came that the session still pays", async () => {
    await renderActions(
      {
        ...awaiting,
        attendance: attendance({
          playerFirstConnectedAt: null,
          overlapMinutes: 0,
          outcome: AttendanceOutcome.PlayerNoShow,
        }),
      },
      true,
    );
    expect(screen.getByTestId("attendance-evidence").textContent).toBe(
      "Anna never joined the call.",
    );
    expect(screen.getByText(/the session counts/)).toBeTruthy();
  });
});

describe("dispute form", () => {
  it("needs a category; text is optional except for other", async () => {
    await renderActions(awaiting, false);
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));

    const submit = screen.getByRole("button", { name: "Open dispute" });
    expect(submit).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText("Other"));
    expect(submit).toHaveProperty("disabled", true);
    expect(screen.getByText("Please describe what went wrong.")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Coach was late or left early"));
    expect(submit).toHaveProperty("disabled", false);
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPath()).toContain("/sessions/session-1/dispute");
    expect(lastBody()).toEqual({
      category: DisputeReasonCategory.CoachLateOrLeftEarly,
    });
  });

  it("sends the explanation with the other category", async () => {
    await renderActions(awaiting, false);
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    fireEvent.click(screen.getByLabelText("Other"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  The coach was rude.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open dispute" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody()).toEqual({
      category: DisputeReasonCategory.Other,
      reason: "The coach was rude.",
    });
  });
});

describe("system-opened dispute", () => {
  const disputed: SessionResponse = {
    ...awaiting,
    status: SessionStatus.Disputed,
    autoConfirmAt: null,
    attendance: attendance({
      coachFirstConnectedAt: null,
      overlapMinutes: 0,
      coachLateMinutes: 0,
      outcome: AttendanceOutcome.CoachNoShow,
    }),
    dispute: systemDispute(),
  };

  it("shows the player the hold, the refund countdown and the confirm action", async () => {
    await renderActions(disputed, false);

    expect(screen.getByText(/Payment on hold/)).toBeTruthy();
    expect(screen.getByTestId("attendance-evidence").textContent).toBe(
      "Coach Li never joined the call.",
    );
    expect(
      screen.getByText(/will be refunded to you in 2 days unless the coach/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Confirm session/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPath()).toContain("/sessions/session-1/confirm");
  });

  it("tells the player an admin decides when no refund is pending", async () => {
    await renderActions(
      {
        ...disputed,
        dispute: systemDispute({
          kind: DisputeKind.EvidenceGap,
          responseDueAt: null,
        }),
        attendance: attendance({ outcome: AttendanceOutcome.EvidenceGap }),
      },
      false,
    );
    expect(screen.getByText(/Our team will review the session/)).toBeTruthy();
  });

  it("lets the coach respond once, with a minimum length", async () => {
    await renderActions(disputed, true);

    expect(screen.getByTestId("attendance-evidence").textContent).toBe(
      "Our records don't show you joining the call.",
    );
    expect(screen.getByText(/refunded to the player in 2 days/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Confirm session/ }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Respond" }));
    const send = screen.getByRole("button", { name: "Send response" });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "too short" },
    });
    expect(send).toHaveProperty("disabled", true);
    expect(
      screen.getByText("Please write at least 20 characters."),
    ).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The call failed, we met on another app." },
    });
    fireEvent.click(send);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPath()).toContain("/sessions/session-1/dispute/response");
    expect(lastBody()).toEqual({
      statement: "The call failed, we met on another app.",
    });
  });

  it("shows the submitted statement instead of the form", async () => {
    await renderActions(
      {
        ...disputed,
        dispute: systemDispute({
          responseDueAt: null,
          coachResponse: "We met on another app.",
          coachRespondedAt: "2026-09-20T11:50:00.000Z",
        }),
      },
      true,
    );
    expect(screen.getByText("We met on another app.")).toBeTruthy();
    expect(screen.getByText(/No automatic refund will happen/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Respond" })).toBeNull();
  });

  it("renders in Russian", async () => {
    await renderActions(disputed, false, "ru");
    expect(screen.getByText(/вернётся вам через 2 дня/)).toBeTruthy();
    expect(screen.getByTestId("attendance-evidence").textContent).toBe(
      "Coach Li так и не подключился(-ась) к звонку.",
    );
  });
});

describe("in-person game", () => {
  const game: SessionResponse = {
    ...awaiting,
    serviceType: ServiceType.Game,
    attendance: null,
    autoConfirmAt: null,
  };

  it("asks the coach for one of two answers and hides the countdown", async () => {
    await renderActions(game, true);

    expect(screen.getByText("Did this game take place?")).toBeTruthy();
    expect(screen.getByText(/released after your answer/)).toBeTruthy();
    expect(screen.queryByText(/confirms automatically/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Confirm session/ }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "The player didn't come" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPath()).toContain("/sessions/session-1/confirm");
    expect(lastBody()).toEqual({ gameAnswer: CoachGameAnswer.PlayerAbsent });
  });

  it("shows the recorded answer and the countdown once answered", async () => {
    await renderActions(
      {
        ...game,
        coachConfirmedAt: "2026-09-20T11:30:00.000Z",
        coachGameAnswer: CoachGameAnswer.TookPlace,
        autoConfirmAt: "2026-09-22T11:00:00.000Z",
      },
      true,
    );
    expect(screen.getByText(/You answered: the game took place/)).toBeTruthy();
    expect(screen.getByText(/confirms automatically/)).toBeTruthy();
  });

  it("keeps the plain confirm for the player", async () => {
    await renderActions(game, false);
    expect(
      screen.getByRole("button", { name: /Confirm session/ }),
    ).toBeTruthy();
  });
});

describe("room waiting note", () => {
  const renderNote = async (startsAt: string, isCoach: boolean) => {
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <WaitingNote
          startsAt={startsAt}
          isCoach={isCoach}
          counterpartName={isCoach ? "Anna" : "Coach Li"}
        />
      </NextIntlClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    return view;
  };

  it("stays quiet for the first ten minutes, then reassures the player", async () => {
    // Started 9 minutes ago.
    await renderNote("2026-09-20T11:51:00.000Z", false);
    expect(screen.queryByRole("status")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Coach Li hasn't joined yet. If they don't join, you won't be charged.",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tells the coach the session still counts", async () => {
    await renderNote("2026-09-20T11:40:00.000Z", true);
    expect(screen.getByRole("status").textContent).toContain(
      "the session still counts",
    );
  });
});

describe("admin dispute queue", () => {
  const item: AdminDisputeItem = {
    id: "dispute-1",
    sessionId: "session-1",
    status: DisputeStatus.Open,
    outcome: null,
    kind: DisputeKind.CoachNoShow,
    reasonCategory: null,
    reason: null,
    adminNote: null,
    responseDueAt: "2026-09-22T11:35:00.000Z",
    coachResponse: null,
    coachRespondedAt: null,
    resolvedVia: null,
    systemNote: null,
    openedAt: "2026-09-20T11:35:00.000Z",
    resolvedAt: null,
    serviceType: ServiceType.Consultation,
    startsAt: "2026-09-20T10:00:00.000Z",
    endsAt: "2026-09-20T11:00:00.000Z",
    amountMinor: 4005,
    currency: "EUR",
    feeMinor: 401,
    player: { id: "player-1", displayName: "Anna" },
    coach: { id: "profile-1", displayName: "Coach Li" },
    attendanceSummary: attendance({
      coachFirstConnectedAt: null,
      overlapMinutes: 0,
      coachLateMinutes: 0,
      outcome: AttendanceOutcome.CoachNoShow,
    }),
    coachPreviousNoShows: 2,
    attendance: [
      {
        userId: "player-1",
        displayName: "Anna",
        joinedAt: "2026-09-20T10:00:00.000Z",
        connectedAt: "2026-09-20T10:00:00.000Z",
        leftAt: "2026-09-20T10:30:00.000Z",
      },
    ],
  };

  const renderQueue = async (open: AdminDisputeItem[]) => {
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <AdminDisputes initial={{ open, resolved: [] }} />
      </NextIntlClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    return view;
  };

  it("shows the kind, the summary above the raw rows, the deadline and the history", async () => {
    const { container } = await renderQueue([item]);

    expect(screen.getAllByText("Coach no-show").length).toBe(2); // chip + badge
    expect(screen.getByText("2 previous no-shows")).toBeTruthy();
    expect(screen.getByText(/Refunds automatically in 2 days/)).toBeTruthy();
    const summary = screen.getByTestId("attendance-summary");
    expect(summary.textContent).toContain("Coach first connected: never");
    expect(summary.textContent).toContain("Together in the call: 0 min");
    const text = container.textContent ?? "";
    expect(text.indexOf("Attendance summary")).toBeLessThan(
      text.indexOf("Raw room entries"),
    );
    // A system dispute has no player quote.
    expect(container.querySelector("blockquote")).toBeNull();
  });

  it("shows the coach's response and drops the deadline", async () => {
    await renderQueue([
      {
        ...item,
        responseDueAt: null,
        coachResponse: "We met on another app.",
        coachRespondedAt: "2026-09-20T11:50:00.000Z",
      },
    ]);
    expect(screen.getByText(/We met on another app\./)).toBeTruthy();
    expect(screen.getByText(/Coach's response/)).toBeTruthy();
    expect(screen.queryByText(/Refunds automatically/)).toBeNull();
  });

  it("refetches the queue filtered by kind", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ open: [], resolved: [] }),
    });
    await renderQueue([item]);

    fireEvent.click(screen.getByRole("button", { name: "Evidence gap" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPath()).toContain("/admin/disputes?kind=evidence_gap");
    await waitFor(() =>
      expect(screen.getByText("No open disputes.")).toBeTruthy(),
    );
    expect(
      screen
        .getByRole("button", { name: "Evidence gap" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
