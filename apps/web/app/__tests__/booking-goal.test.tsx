import { ServiceType, type ProServiceResponse } from "@playwithpro/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { BookingPanel } from "@/components/booking/booking-panel";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/coaches/profile-1",
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/sessions") && !init?.method) {
      return { ok: true, json: async () => ({ upcoming: [], past: [] }) };
    }
    if (url.endsWith("/bookings")) {
      return { ok: true, status: 200, json: async () => ({ id: "session-9" }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const services: ProServiceResponse[] = [
  {
    type: ServiceType.Consultation,
    priceMinor: 4005,
    currency: "EUR",
    venueLabel: "",
    venueLat: null,
    venueLng: null,
    active: true,
  },
];
const slot = {
  id: "slot-1",
  startsAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
  endsAt: new Date(Date.now() + 49 * 3_600_000).toISOString(),
};

describe("BookingPanel goal", () => {
  it("sends the trimmed goal with the booking and previews it in the summary", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BookingPanel
          proId="profile-1"
          services={services}
          initialSlots={[slot]}
          viewer="amateur"
        />
      </NextIntlClientProvider>,
    );

    // Pick the only slot (rendered after mount, in the local timezone).
    const slotButtons = await screen.findAllByRole("button", {
      name: /^\d{1,2}:\d{2}/,
    });
    fireEvent.click(slotButtons[0]);

    const goal = screen.getByLabelText(/What should we focus on/);
    fireEvent.change(goal, { target: { value: "  Backhand loop  " } });
    expect(screen.getByText("🎯 Backhand loop")).toBeInTheDocument();
    expect(
      screen.getByText(/The coach sees this after payment/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Book & continue/ }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/booking/session-9"),
    );
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/bookings"),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      proId: "profile-1",
      serviceType: "consultation",
      slotId: "slot-1",
      goal: "Backhand loop",
    });
  });
});
