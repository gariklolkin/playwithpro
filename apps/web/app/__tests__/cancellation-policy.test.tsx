import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  CancellationTier,
  CancelledBy,
  PaymentStatus,
  ServiceType,
  SessionStatus,
  type AdminPaymentItem,
  type CancellationRecord,
  type SessionResponse,
} from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import deMessages from "../../messages/de.json";
import { AdminSessionActions } from "@/components/admin/admin-session-actions";
import {
  CancellationPolicyBlock,
  CancellationPolicySummary,
} from "@/components/booking/cancellation-policy";
import { SessionActions } from "@/components/sessions/session-actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();
const NOW = new Date("2026-09-22T12:00:00Z");

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

async function renderIn(ui: React.ReactElement, locale: "en" | "de" = "en") {
  const view = render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? messages : deMessages}
      timeZone="UTC"
    >
      {ui}
    </NextIntlClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  return view;
}

const upcoming: SessionResponse = {
  id: "session-1",
  status: SessionStatus.PaidEscrow,
  serviceType: ServiceType.Consultation,
  priceMinor: 4005,
  currency: "EUR",
  startsAt: "2026-09-22T22:00:00.000Z",
  endsAt: "2026-09-22T23:00:00.000Z",
  expiresAt: null,
  coach: { id: "profile-1", displayName: "Coach Li", avatarUrl: null },
  player: { id: "player-1", displayName: "Anna", avatarUrl: null },
  videos: [],
  venue: null,
  room: null,
  autoConfirmAt: null,
  playerConfirmedAt: null,
  coachConfirmedAt: null,
  coachGameAnswer: null,
  cancellationPolicy: null,
  cancellationTerms: {
    tier: CancellationTier.Partial,
    refundMinor: 2003,
    coachNetMinor: 1802,
    late: false,
  },
  cancellation: null,
  attendance: null,
  escrow: PaymentStatus.Held,
  dispute: null,
  review: null,
  reviewable: false,
  goal: null,
  playerContext: null,
  createdAt: "2026-09-19T10:00:00.000Z",
};

const record = (
  overrides: Partial<CancellationRecord> = {},
): CancellationRecord => ({
  by: CancelledBy.Player,
  at: "2026-09-22T11:00:00.000Z",
  tier: CancellationTier.Partial,
  refundMinor: 2003,
  coachNetMinor: 1802,
  late: false,
  waived: false,
  settled: false,
  settlesAt: "2026-09-22T22:00:00.000Z",
  ...overrides,
});

const lastPath = () => String(fetchMock.mock.calls.at(-1)![0]);

describe("policy before payment", () => {
  it("summarizes the platform policy from its own numbers", async () => {
    await renderIn(
      <CancellationPolicySummary
        policy={{
          freeHours: 48,
          lateRefundPercent: 30,
          noRefundHours: 4,
          graceMinutes: 30,
        }}
      />,
    );
    expect(
      screen.getByText(
        /Free cancellation until 48 h before the start, 30% refund until 4 h before/,
      ),
    ).toBeTruthy();
  });

  it("states the snapshotted terms as concrete moments", async () => {
    await renderIn(
      <CancellationPolicyBlock
        policy={{
          freeUntil: "2026-09-23T16:00:00.000Z",
          partialUntil: "2026-09-24T14:00:00.000Z",
          graceUntil: null,
          lateRefundPercent: 50,
          graceMinutes: 30,
        }}
      />,
    );
    expect(
      screen.getByText(/Free cancellation until Wed, Sep 23/),
    ).toBeTruthy();
    expect(screen.getByText(/50% refund until Thu, Sep 24/)).toBeTruthy();
    expect(screen.getByText("No refund after that.")).toBeTruthy();
    expect(screen.getByText(/whenever the coach cancels/)).toBeTruthy();
  });

  it("offers the grace instead of a deadline that already passed", async () => {
    await renderIn(
      <CancellationPolicyBlock
        policy={{
          freeUntil: "2026-09-21T17:00:00.000Z",
          partialUntil: "2026-09-22T15:00:00.000Z",
          graceUntil: "2026-09-22T12:30:00.000Z",
          lateRefundPercent: 50,
          graceMinutes: 30,
        }}
      />,
      "de",
    );
    expect(
      screen.getByText(
        /Kostenlose Stornierung für 30 Minuten nach der Zahlung/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Kostenlose Stornierung bis/)).toBeNull();
  });
});

describe("cancel dialog", () => {
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: "Cancel session" }));

  it("names both amounts to a player cancelling in the partial tier", async () => {
    await renderIn(<SessionActions session={upcoming} isCoach={false} />);
    open();
    expect(screen.getByTestId("cancel-terms").textContent).toBe(
      "Cancel this session? The free-cancellation deadline has passed: €20.03 is refunded to you and €20.02 goes to the coach.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPath()).toContain("/sessions/session-1/cancel");
  });

  it("says when nothing comes back", async () => {
    await renderIn(
      <SessionActions
        session={{
          ...upcoming,
          cancellationTerms: {
            tier: CancellationTier.None,
            refundMinor: 0,
            coachNetMinor: 3604,
            late: false,
          },
        }}
        isCoach={false}
      />,
    );
    open();
    expect(screen.getByTestId("cancel-terms").textContent).toContain(
      "nothing is refunded and €40.05 goes to the coach",
    );
  });

  it("warns a coach that a cancellation this late is recorded", async () => {
    await renderIn(
      <SessionActions
        session={{
          ...upcoming,
          cancellationTerms: {
            tier: CancellationTier.Free,
            refundMinor: 4005,
            coachNetMinor: 0,
            late: true,
          },
        }}
        isCoach
      />,
    );
    open();
    expect(screen.getByTestId("cancel-terms").textContent).toContain(
      "recorded as a late cancellation",
    );
  });
});

describe("cancelled entry", () => {
  const cancelled = (cancellation: CancellationRecord): SessionResponse => ({
    ...upcoming,
    status: SessionStatus.Cancelled,
    cancellationTerms: null,
    cancellation,
  });

  it("tells the player what comes back and when", async () => {
    await renderIn(
      <SessionActions session={cancelled(record())} isCoach={false} />,
    );
    expect(
      screen.getByText(/You cancelled · Partly refunded \(€20.03\)/),
    ).toBeTruthy();
    expect(
      screen.getByText(/€20.03 is refunded to you in 10 hours/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Refund in full/ })).toBeNull();
  });

  it("lets the coach refund in full while the payment has not settled", async () => {
    await renderIn(<SessionActions session={cancelled(record())} isCoach />);
    expect(screen.getByText(/The player cancelled/)).toBeTruthy();
    expect(screen.getByText(/You receive €18.02 in 10 hours/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Refund in full/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPath()).toContain("/sessions/session-1/cancellation/waive");
  });

  it("offers no waiver once settled, waived, or when it was free", async () => {
    for (const cancellation of [
      record({ settled: true, settlesAt: null }),
      record({ waived: true, refundMinor: 4005, coachNetMinor: 0 }),
      record({ tier: CancellationTier.Free, refundMinor: 4005, settled: true }),
    ]) {
      const view = await renderIn(
        <SessionActions session={cancelled(cancellation)} isCoach />,
      );
      expect(
        screen.queryByRole("button", { name: /Refund in full/ }),
      ).toBeNull();
      view.unmount();
    }
  });

  it("marks a late coach cancellation and an admin's force majeure", async () => {
    const view = await renderIn(
      <SessionActions
        session={cancelled(
          record({
            by: CancelledBy.Coach,
            tier: CancellationTier.Free,
            refundMinor: 4005,
            coachNetMinor: 0,
            late: true,
            settled: true,
            settlesAt: null,
          }),
        )}
        isCoach={false}
      />,
    );
    expect(screen.getByText(/The coach cancelled · Refunded/)).toBeTruthy();
    expect(screen.getByText("Late cancellation")).toBeTruthy();
    view.unmount();

    await renderIn(
      <SessionActions
        session={cancelled(
          record({
            by: CancelledBy.Admin,
            tier: CancellationTier.Free,
            refundMinor: 4005,
            settled: true,
            settlesAt: null,
          }),
        )}
        isCoach
      />,
    );
    expect(
      screen.getByText(/Cancelled by PlayWithPro · Refunded/),
    ).toBeTruthy();
  });
});

describe("admin session actions", () => {
  const payment: AdminPaymentItem = {
    id: "p1",
    sessionId: "session-1",
    serviceType: ServiceType.Consultation,
    playerDisplayName: "Anna",
    coachDisplayName: "Coach Li",
    provider: "mock",
    providerRef: "ref-1",
    amountMinor: 4005,
    currency: "EUR",
    feeMinor: 401,
    status: PaymentStatus.Held,
    refundedMinor: null,
    sessionStatus: SessionStatus.PaidEscrow,
    sessionStartsAt: "2026-09-22T22:00:00.000Z",
    cancellation: null,
    createdAt: "2026-09-19T10:00:00.000Z",
    updatedAt: "2026-09-19T10:00:00.000Z",
  };

  it("cancels as force majeure only with a reason", async () => {
    await renderIn(<AdminSessionActions payment={payment} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel session (force majeure)" }),
    );
    const confirm = screen.getByRole("button", { name: "Cancel and refund" });
    expect(confirm).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "  Venue closed " },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPath()).toContain("/admin/sessions/session-1/cancel");
    expect(
      JSON.parse(
        (fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string,
      ),
    ).toEqual({ reason: "Venue closed" });
  });

  it("waives the fee of a late cancellation that has not settled", async () => {
    await renderIn(
      <AdminSessionActions
        payment={{
          ...payment,
          sessionStatus: SessionStatus.Cancelled,
          cancellation: { ...record(), reason: null },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Waive late fee/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPath()).toContain(
      "/admin/sessions/session-1/cancellation/waive",
    );
  });

  it("offers nothing on a settled payment or a started session", async () => {
    for (const item of [
      { ...payment, status: PaymentStatus.Released },
      { ...payment, sessionStartsAt: "2026-09-22T11:00:00.000Z" },
    ]) {
      const view = await renderIn(<AdminSessionActions payment={item} />);
      expect(view.container.textContent).toBe("");
      view.unmount();
    }
  });
});
