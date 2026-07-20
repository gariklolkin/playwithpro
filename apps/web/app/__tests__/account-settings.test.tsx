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
  avatarUrl: null,
};

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AccountSettings initialUser={user} />
    </NextIntlClientProvider>,
  );
}

describe("AccountSettings timezone", () => {
  it("opens the full zone list on click", () => {
    renderSettings();

    fireEvent.click(screen.getByLabelText("Timezone"));

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(100);
    expect(
      screen.getByRole("option", { name: "Europe/Berlin" }),
    ).toBeInTheDocument();
  });

  it("narrows the list while typing", () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "berl" },
    });

    expect(
      screen.getByRole("option", { name: "Europe/Berlin" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Asia/Tokyo" }),
    ).not.toBeInTheDocument();
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

  it("saves a timezone picked from the filtered list", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...user, timezone: "Europe/Berlin" }),
    });
    renderSettings();

    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "berl" },
    });
    fireEvent.mouseDown(screen.getByRole("option", { name: "Europe/Berlin" }));
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

describe("AccountSettings password", () => {
  it("blocks the change when the confirmation does not match", async () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "oldpass12" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpass12" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "newpass21" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("Passwords don't match."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
