import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { LoginCard } from "@/components/auth/login-card";
import { RegisterCard } from "@/components/auth/register-card";

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
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

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  searchParams = new URLSearchParams();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("LoginCard", () => {
  it("logs in and redirects to the dashboard", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: String(url).endsWith("/auth/login"),
        status: String(url).endsWith("/auth/login") ? 200 : 401,
      }),
    );

    renderWithIntl(<LoginCard />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    const loginCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/auth/login"),
    );
    expect(loginCall).toBeDefined();
    expect(JSON.parse((loginCall![1] as RequestInit).body as string)).toEqual({
      email: "player@example.com",
      password: "password1",
    });
  });

  it("shows a generic error on invalid credentials", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    renderWithIntl(<LoginCard />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByText("Invalid email or password."),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects to the requested page after login", async () => {
    searchParams = new URLSearchParams("next=%2Fsettings%2Faccount");
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: String(url).endsWith("/auth/login"),
        status: 200,
      }),
    );

    renderWithIntl(<LoginCard />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/settings/account"));
  });
});

describe("RegisterCard", () => {
  it("registers with the chosen role", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    renderWithIntl(<RegisterCard />);

    fireEvent.click(screen.getByRole("button", { name: /I'm a professional/ }));
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Coach Ma" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "coach@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    // No session yet: the form switches to the check-your-inbox screen.
    expect(await screen.findByText(/Almost there/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    const registerCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/auth/register"),
    );
    expect(
      JSON.parse((registerCall![1] as RequestInit).body as string),
    ).toEqual({
      role: "professional",
      displayName: "Coach Ma",
      email: "coach@example.com",
      password: "password1",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it("verifies the emailed code and goes straight to the dashboard", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    renderWithIntl(<RegisterCard />);

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText(/Almost there/);

    fireEvent.change(screen.getByLabelText("Confirmation code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    const verify = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/auth/email/verify"),
    );
    expect(JSON.parse((verify![1] as RequestInit).body as string)).toEqual({
      email: "new@example.com",
      code: "123456",
    });
  });

  it("shows an error for a wrong code", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201 });

    renderWithIntl(<RegisterCard />);

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText(/Almost there/);

    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    fireEvent.change(screen.getByLabelText("Confirmation code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText(/That code didn't work/),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("offers a confirmation code on unverified login", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    renderWithIntl(<LoginCard />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByText(/email is not confirmed/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Get a confirmation code" }),
    );
    await waitFor(() => {
      const resend = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("/auth/email/resend"),
      );
      expect(resend).toBeDefined();
    });
    // The email travels via sessionStorage, never in the URL.
    expect(sessionStorage.getItem("pendingVerificationEmail")).toBe(
      "player@example.com",
    );
    expect(push).toHaveBeenCalledWith("/verify-email");
  });

  it("preselects the professional role from ?role=professional", async () => {
    searchParams = new URLSearchParams("role=professional");
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    renderWithIntl(<RegisterCard />);

    expect(
      screen.getByRole("button", { name: /I'm a professional/ }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Coach Ma" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "coach@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/Almost there/)).toBeInTheDocument();
    const registerCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/auth/register"),
    );
    expect(
      JSON.parse((registerCall![1] as RequestInit).body as string).role,
    ).toBe("professional");
  });

  it("tells the user the email is taken on a conflict", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409 });

    renderWithIntl(<RegisterCard />);

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "taken@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText(/This email is already registered/),
    ).toBeInTheDocument();
  });

  it("shows a generic error when registration fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    renderWithIntl(<RegisterCard />);

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "taken@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText(
        "Registration failed. Check the details and try again.",
      ),
    ).toBeInTheDocument();
  });
});
