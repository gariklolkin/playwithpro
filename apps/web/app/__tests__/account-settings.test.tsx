import { fireEvent, render, screen } from "@testing-library/react";
import { Role, type MeResponse } from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { AccountSettings } from "@/components/settings/account-settings";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/settings/account",
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const user: MeResponse = {
  id: "u1",
  email: "coach@example.com",
  role: Role.Professional,
  displayName: "Coach Ma",
  locale: "en",
  timezone: "UTC",
  emailVerified: true,
  hasPassword: true,
  googleLinked: false,
};

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AccountSettings initialUser={user} />
    </NextIntlClientProvider>,
  );
}

describe("AccountSettings timezone", () => {
  it("offers typeahead options from the supported zone list", () => {
    renderSettings();

    const input = screen.getByLabelText("Timezone");
    expect(input).toHaveAttribute("list", "settings-timezone-options");
    expect(
      document.querySelector(
        '#settings-timezone-options option[value="Europe/Berlin"]',
      ),
    ).not.toBeNull();
  });

  it("blocks saving a value outside the supported zones", async () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "Not/AZone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Pick a timezone from the list."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves a valid timezone", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...user, timezone: "Europe/Berlin" }),
    });
    renderSettings();

    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "Europe/Berlin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Profile updated.")).toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/users/me"),
    );
    expect(patchCall).toBeDefined();
    expect(
      JSON.parse((patchCall![1] as RequestInit).body as string).timezone,
    ).toBe("Europe/Berlin");
  });
});
