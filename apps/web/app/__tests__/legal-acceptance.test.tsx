import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  LegalDocument,
  Role,
  type LegalStatusResponse,
} from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import deMessages from "../../messages/de.json";
import { RegisterCard } from "@/components/auth/register-card";
import { LegalGate } from "@/components/legal/legal-gate";
import { LegalConsentCheckbox } from "@/components/legal/legal-consent-checkbox";
import { SiteFooter } from "@/components/legal/site-footer";

const pathname = vi.fn(() => "/en/dashboard");
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh, push: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  redirect: vi.fn(),
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

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  pathname.mockReturnValue("/en/dashboard");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

function renderIn(ui: React.ReactElement, locale: "en" | "de" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? messages : deMessages}
      timeZone="UTC"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

const lastBody = () =>
  JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);

describe("registration consent", () => {
  it("does not submit without the checkbox and explains why", () => {
    renderIn(<RegisterCard />);
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Anna" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "anna@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /create account|sign up/i }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("accept the terms");
  });

  it("sends the versions it linked to and the visitor's locale", async () => {
    renderIn(<RegisterCard />, "de");
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Anna" },
    });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: "anna@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/passwort/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: /konto erstellen|registrieren/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({
      acceptedTerms: "2026-09-18",
      acceptedPrivacy: "2026-09-18",
      locale: "de",
    });
  });

  it("links the coach agreement when a professional signs up", () => {
    renderIn(
      <LegalConsentCheckbox
        checked={false}
        onChange={() => undefined}
        role={Role.Professional}
        showError={false}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Terms of Service" }),
    ).toHaveProperty("href", expect.stringContaining("/legal/terms"));
    expect(screen.getByRole("link", { name: "Coach Agreement" })).toBeTruthy();
  });
});

describe("legal gate", () => {
  const stale: LegalStatusResponse = {
    stale: [
      {
        document: LegalDocument.Terms,
        version: "2026-09-18",
        effectiveAt: "2026-09-18",
        acceptedVersion: "2026-01-01",
      },
    ],
    notices: [],
  };

  it("blocks with the documents and accepts them in one click", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ stale: [], notices: [] }),
    });
    renderIn(<LegalGate initialStatus={stale} locale="en" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Terms of Service");
    expect(
      screen.getByRole("link", { name: "Terms of Service" }),
    ).toHaveProperty(
      "href",
      expect.stringContaining("/legal/terms/2026-09-18"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /I have read and accept/ }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("/legal/accept");
    expect(lastBody()).toEqual({
      accepted: [{ document: LegalDocument.Terms, version: "2026-09-18" }],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it("never blocks the room or the legal pages", () => {
    for (const path of ["/en/sessions/abc/room", "/de/legal/terms"]) {
      pathname.mockReturnValue(path);
      const view = renderIn(<LegalGate initialStatus={stale} locale="en" />);
      expect(screen.queryByRole("dialog")).toBeNull();
      view.unmount();
    }
  });

  it("shows a dismissible banner for a minor update", () => {
    renderIn(
      <LegalGate
        initialStatus={{
          stale: [],
          notices: [
            {
              document: LegalDocument.Privacy,
              version: "2026-10-01",
              effectiveAt: "2026-10-01",
              acceptedVersion: "2026-09-18",
            },
          ],
        }}
        locale="en"
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Privacy Policy");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(localStorage.getItem("legal-notice-dismissed")).toContain(
      "privacy:2026-10-01",
    );
  });

  it("renders nothing for visitors", () => {
    const { container } = renderIn(
      <LegalGate initialStatus={null} locale="en" />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("site footer", () => {
  it("links every document, cookie settings and support", () => {
    renderIn(<SiteFooter />);
    const names = screen.getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual([
      "Terms",
      "Privacy",
      "Imprint",
      "Booking policy",
      "Coach agreement",
      "Cookie settings",
      "Support",
    ]);
  });

  it("is compact in the room", () => {
    pathname.mockReturnValue("/en/sessions/abc/room");
    renderIn(<SiteFooter />);
    expect(screen.getByTestId("site-footer").className).toContain("py-1.5");
  });
});
