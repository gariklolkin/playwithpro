import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  CancellationTier,
  PaymentStatus,
  ServiceType,
  SessionStatus,
  type PublicAvailabilitySlot,
  type RescheduleProposal,
  type SessionResponse,
} from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import ruMessages from "../../messages/ru.json";
import { RescheduleBanner } from "@/components/sessions/reschedule-banner";
import { validRescheduleSlots } from "@/components/sessions/reschedule-dialog";
import { SessionActions } from "@/components/sessions/session-actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
// The legal links use the locale-aware Link; the real module needs Next's runtime.
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  Link: ({
    href,
    children,
    ...props
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const fetchMock = vi.fn();
const NOW = new Date("2026-09-22T12:00:00Z");
const HOUR = 3_600_000;
const iso = (hoursFromNow: number) =>
  new Date(NOW.getTime() + hoursFromNow * HOUR).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderIn(ui: React.ReactElement, locale: "en" | "ru" = "en") {
  const view = render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? messages : ruMessages}
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

const session: SessionResponse = {
  id: "session-1",
  status: SessionStatus.PaidEscrow,
  serviceType: ServiceType.Consultation,
  priceMinor: 4005,
  currency: "EUR",
  startsAt: iso(72),
  endsAt: iso(73),
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
  reschedule: null,
  rescheduleAllowed: true,
  rescheduleCount: 0,
  cancellationPolicy: null,
  cancellationTerms: {
    tier: CancellationTier.Free,
    refundMinor: 4005,
    coachNetMinor: 0,
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
  createdAt: iso(-48),
};

const slot = (id: string, from: number, hours = 1): PublicAvailabilitySlot => ({
  id,
  startsAt: iso(from),
  endsAt: iso(from + hours),
});

const proposal = (mine: boolean): RescheduleProposal => ({
  id: "proposal-1",
  proposedBy: mine ? "player" : "coach",
  mine,
  options: [
    { id: "option-1", startsAt: iso(120), endsAt: iso(121) },
    { id: "option-2", startsAt: iso(144), endsAt: iso(145) },
  ],
  expiresAt: iso(20),
  fromStartsAt: iso(72),
});

const lastCall = () => fetchMock.mock.calls.at(-1)!;

describe("validRescheduleSlots", () => {
  it("keeps only same-duration slots far enough ahead and within 30 days", () => {
    const valid = validRescheduleSlots(
      [
        slot("ok", 100),
        slot("too-soon", 1),
        slot("two-hours", 100, 2),
        slot("too-far", 72 + 31 * 24),
        slot("same-time", 72),
        slot("earlier-ok", 30),
      ],
      session,
      NOW.getTime(),
    );
    expect(valid.map((s) => s.id)).toEqual(["earlier-ok", "ok"]);
  });
});

describe("proposing a new time", () => {
  it("offers up to three valid times and sends the chosen ones", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        slot("s1", 100),
        slot("s2", 101),
        slot("s3", 102),
        slot("s4", 103),
        slot("bad", 1),
      ],
    });
    await renderIn(<SessionActions session={session} isCoach={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Propose a new time/ }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(4),
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/pros/profile-1/slots",
    );
    const send = () => screen.getByRole("button", { name: /^Propose/ });
    expect(send()).toHaveProperty("disabled", true);

    for (const button of screen.getAllByRole("button", { pressed: false })) {
      fireEvent.click(button);
    }
    // The fourth pick is ignored: three options at most.
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(3);
    expect(send().textContent).toBe("Propose 3 times");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    fireEvent.click(send());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(String(lastCall()[0])).toContain("/sessions/session-1/reschedule");
    expect(JSON.parse((lastCall()[1] as RequestInit).body as string)).toEqual({
      slotIds: ["s1", "s2", "s3"],
    });
  });

  it("explains a conflict and lets the player pick again", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [slot("s1", 100)],
    });
    await renderIn(<SessionActions session={session} isCoach={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Propose a new time/ }));
    await waitFor(() => screen.getByRole("button", { pressed: false }));
    fireEvent.click(screen.getByRole("button", { pressed: false }));

    fetchMock.mockResolvedValueOnce({ ok: false, status: 409 });
    fireEvent.click(screen.getByRole("button", { name: "Propose 1 time" }));
    await waitFor(() =>
      expect(screen.getByText(/was just taken/)).toBeTruthy(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is not offered when the session cannot be moved", async () => {
    await renderIn(
      <SessionActions
        session={{ ...session, rescheduleAllowed: false }}
        isCoach={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Propose a new time/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel session" })).toBeTruthy();
  });

  it("suggests it to a coach who is about to cancel", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await renderIn(<SessionActions session={session} isCoach />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel session" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Propose a new time instead" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("group", { name: "Propose a new time" }),
      ).toBeTruthy(),
    );
  });
});

describe("pending proposal banner", () => {
  it("lets the responder accept one option or decline", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await renderIn(
      <SessionActions
        session={{
          ...session,
          rescheduleAllowed: false,
          reschedule: proposal(false),
        }}
        isCoach={false}
      />,
    );

    // The banner mounts once the card knows the time; its own clock follows.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const banner = screen.getByTestId("reschedule-banner");
    expect(banner.textContent).toContain("Coach Li proposes a new time");
    expect(banner.textContent).toContain("Sun, Sep 27");
    expect(banner.textContent).toContain("Mon, Sep 28");
    expect(banner.textContent).toContain("expires in 20 hours");
    expect(screen.queryByRole("button", { name: /Withdraw/ })).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[1]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(String(lastCall()[0])).toContain(
      "/sessions/session-1/reschedule/accept",
    );
    expect(JSON.parse((lastCall()[1] as RequestInit).body as string)).toEqual({
      optionId: "option-2",
    });

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(String(lastCall()[0])).toContain("/reschedule/decline"),
    );
  });

  it("lets the proposer only withdraw (in Russian, as in the room)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onChanged = vi.fn();
    await renderIn(
      <RescheduleBanner
        sessionId="session-1"
        proposal={proposal(true)}
        counterpartName="Coach Li"
        onChanged={onChanged}
      />,
      "ru",
    );

    expect(screen.getByTestId("reschedule-banner").textContent).toContain(
      "Вы предложили Coach Li другое время",
    );
    expect(screen.queryByRole("button", { name: "Принять" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Отозвать предложение" }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(String(lastCall()[0])).toContain("/reschedule/withdraw");
  });
});
