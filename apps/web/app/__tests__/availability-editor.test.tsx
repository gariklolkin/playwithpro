import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CoachAvailabilityResponse } from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { AvailabilityEditor } from "@/components/availability/availability-editor";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// A day 8–14 days out, kept inside the currently displayed month when
// possible; the test clicks month navigation when it is not.
const target = new Date(Date.now() + 8 * 86_400_000);
target.setUTCHours(18, 0, 0, 0);
const dayIso = target.toISOString();
const dayCellKey = dayIso.slice(0, 10);
const nextHourIso = new Date(target.getTime() + 3_600_000).toISOString();
const bookedIso = new Date(target.getTime() + 2 * 3_600_000).toISOString();

const fixture: CoachAvailabilityResponse = {
  timezone: "UTC",
  rules: [],
  slots: [
    {
      id: "slot-open",
      startsAt: dayIso,
      endsAt: nextHourIso,
      status: "open",
      source: "manual",
    },
    {
      id: "slot-booked",
      startsAt: bookedIso,
      endsAt: new Date(target.getTime() + 3 * 3_600_000).toISOString(),
      status: "booked",
      source: "rule",
    },
  ],
};

function renderEditor(data: CoachAvailabilityResponse = fixture) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AvailabilityEditor initialData={data} />
    </NextIntlClientProvider>,
  );
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

/** Clicks into the month containing the fixture day, then opens the day. */
function openTargetDay() {
  const monthNow = new Date().getUTCMonth();
  if (target.getUTCMonth() !== monthNow) {
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  }
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`^${dayCellKey}`) }),
  );
}

describe("AvailabilityEditor", () => {
  it("shows per-day open and booked counts in the calendar", () => {
    renderEditor();
    if (target.getUTCMonth() !== new Date().getUTCMonth()) {
      fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    }
    // 1 open + 1 booked on the fixture day → both badges rendered.
    const cell = screen.getByRole("button", {
      name: new RegExp(`^${dayCellKey}`),
    });
    expect(cell.textContent).toContain("1");
  });

  it("opens the day editor with active, free, and booked hours", () => {
    renderEditor();
    openTargetDay();
    // The 18:00 open slot is an active toggle; the 20:00 booked one is locked text.
    expect(
      screen.getByRole("button", { name: "18:00", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "19:00", pressed: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(/20:00 · Booked/)).toBeInTheDocument();
  });

  it("creates a slot when toggling a free hour", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    renderEditor();
    openTargetDay();

    fireEvent.click(screen.getByRole("button", { name: "19:00" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/pros/me/availability/slots"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ startsAt: nextHourIso }),
        }),
      );
    });
  });

  it("removes the slot when toggling an active hour", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...fixture, slots: [fixture.slots[1]] }),
    );
    renderEditor();
    openTargetDay();

    fireEvent.click(screen.getByRole("button", { name: "18:00" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/pros/me/availability/slots/slot-open"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("shows the calendar tab by default and the template on switch", () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: "Save template" })).toBeNull();
    expect(screen.getByRole("tab", { name: /Calendar/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: /Weekly template/ }));
    expect(
      screen.getByRole("button", { name: "Save template" }),
    ).toBeDisabled();
  });

  it("saves an edited template and re-disables Save", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...fixture,
        rules: [
          { id: "r1", weekday: 0, startMinute: 18 * 60, endMinute: 20 * 60 },
        ],
      }),
    );
    renderEditor();
    fireEvent.click(screen.getByRole("tab", { name: /Weekly template/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Add hours/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/pros/me/availability/rules"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            rules: [{ weekday: 0, startMinute: 18 * 60, endMinute: 20 * 60 }],
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save template" }),
      ).toBeDisabled();
    });
  });

  it("surfaces a server error from a failed toggle", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({ message: "The slot overlaps an existing one." }),
    });
    renderEditor();
    openTargetDay();

    fireEvent.click(screen.getByRole("button", { name: "19:00" }));

    expect(
      await screen.findByText("The slot overlaps an existing one."),
    ).toBeInTheDocument();
  });
});
