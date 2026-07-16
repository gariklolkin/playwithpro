import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { LocaleSwitcher } from "@/components/locale-switcher";

const replace = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/register",
}));

const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderSwitcher(isAuthenticated: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LocaleSwitcher isAuthenticated={isAuthenticated} />
    </NextIntlClientProvider>,
  );
}

describe("LocaleSwitcher", () => {
  it("switches the current page to the selected locale", () => {
    renderSwitcher(false);

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ru" },
    });

    expect(replace).toHaveBeenCalledWith("/register", { locale: "ru" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists the choice to the profile for authenticated users", () => {
    renderSwitcher(true);

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "de" },
    });

    expect(replace).toHaveBeenCalledWith("/register", { locale: "de" });
    const patchCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/users/me"),
    );
    expect(patchCall).toBeDefined();
    expect((patchCall![1] as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      locale: "de",
    });
  });
});
