import { fireEvent, render, screen } from "@testing-library/react";
import { Role, type MeResponse } from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { SettingsDialogHost } from "@/components/settings/settings-dialog-host";

const replace = vi.fn();
let search = "";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => "/dashboard/sessions",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const user: MeResponse = {
  id: "u1",
  email: "player@example.com",
  role: Role.Amateur,
  displayName: "Smoke Player",
  locale: "en",
  timezone: "UTC",
  emailVerified: true,
  hasPassword: true,
  googleLinked: false,
  avatarUrl: null,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderHost(query: string) {
  search = query;
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SettingsDialogHost user={user} />
    </NextIntlClientProvider>,
  );
}

describe("SettingsDialogHost", () => {
  it("renders nothing without the settings parameter", () => {
    renderHost("page=2");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on the Security tab from ?settings=security", () => {
    renderHost("settings=security");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Security" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
  });

  it("falls back to the Profile tab for an unknown value", () => {
    renderHost("settings=nope");

    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
  });

  it("switches tabs by rewriting the parameter", () => {
    renderHost("settings=profile");

    fireEvent.click(screen.getByRole("tab", { name: "Security" }));

    expect(replace).toHaveBeenCalledWith(
      { pathname: "/dashboard/sessions", query: { settings: "security" } },
      { scroll: false },
    );
  });

  it("closes by removing only the settings parameter", () => {
    renderHost("page=2&settings=profile");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(replace).toHaveBeenCalledWith(
      { pathname: "/dashboard/sessions", query: { page: "2" } },
      { scroll: false },
    );
  });

  it("closes on Escape", () => {
    renderHost("settings=profile");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(replace).toHaveBeenCalledWith(
      { pathname: "/dashboard/sessions", query: {} },
      { scroll: false },
    );
  });
});
