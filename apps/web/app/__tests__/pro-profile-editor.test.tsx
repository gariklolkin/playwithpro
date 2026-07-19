import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ProProfileStatus,
  VerificationState,
  type ProProfileResponse,
} from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { ProProfileEditor } from "@/components/pros/pro-profile-editor";

const push = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const draftProfile: ProProfileResponse = {
  id: "profile-1",
  status: ProProfileStatus.Draft,
  bio: "",
  languages: [],
  services: [],
  latestVerification: null,
};

function renderEditor(
  profile: ProProfileResponse = draftProfile,
  emailVerified = true,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProProfileEditor
        initialProfile={profile}
        emailVerified={emailVerified}
      />
    </NextIntlClientProvider>,
  );
}

describe("ProProfileEditor", () => {
  it("saves the about section with selected languages", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...draftProfile,
          bio: "20 years of coaching",
          languages: ["en", "de"],
        }),
    });
    renderEditor();

    fireEvent.change(screen.getByLabelText("About you"), {
      target: { value: "20 years of coaching" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "English" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Deutsch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    // Saved state = the Save button disables again (no separate note).
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save profile" }),
      ).toBeDisabled(),
    );
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/pros/me/profile"),
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string) as {
      bio: string;
      languages: string[];
    };
    expect(body.bio).toBe("20 years of coaching");
    expect(body.languages).toEqual(["en", "de"]);
  });

  it("keeps Save disabled until something changes and after a successful save", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...draftProfile, bio: "New bio" }),
    });
    renderEditor();

    const save = screen.getByRole("button", { name: "Save profile" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("About you"), {
      target: { value: "New bio" },
    });
    expect(save).toBeEnabled();

    fireEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
  });

  it("sends the hourly price converted to minor units", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(draftProfile),
    });
    renderEditor();

    fireEvent.click(screen.getByRole("checkbox", { name: /Consultation/ }));
    fireEvent.change(screen.getByLabelText("Hourly rate"), {
      target: { value: "40.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("/pros/me/services/consultation"),
      );
      expect(call).toBeDefined();
      expect(
        (
          JSON.parse((call![1] as RequestInit).body as string) as {
            priceMinor: number;
          }
        ).priceMinor,
      ).toBe(4050);
    });
  });

  it("shows the API error when the game service misses a mapped venue", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          message:
            "The in-person game service requires a venue picked on the map.",
        }),
    });
    renderEditor();

    fireEvent.click(screen.getByRole("checkbox", { name: /Practice game/ }));
    fireEvent.change(screen.getByLabelText("Hourly rate"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/requires a venue picked on the map/),
    ).toBeInTheDocument();
  });

  it("submits verification with one click and shows the privacy note", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...draftProfile,
          status: ProProfileStatus.PendingReview,
        }),
    });
    renderEditor();

    expect(
      screen.getByText(/visible to administrators only/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/everything we need for the review/),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for verification" }),
    );

    // One intent, one step: submission leads straight to the slot picker.
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/verification"),
    );
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/pros/me/verification"),
    );
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({});
  });

  it("asks to confirm the email instead of offering submission", () => {
    renderEditor(draftProfile, false);

    expect(screen.getByText(/Confirm your email address/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit for verification" }),
    ).not.toBeInTheDocument();
  });

  it("prompts the coach to book the call while awaiting scheduling", () => {
    renderEditor({
      ...draftProfile,
      status: ProProfileStatus.PendingReview,
      latestVerification: {
        id: "req-1",
        state: VerificationState.AwaitingScheduling,
        adminNote: "",
        noShowCount: 0,
        lastBookingOutcome: null,
        booking: null,
        createdAt: new Date().toISOString(),
        reviewedAt: null,
      },
    });

    expect(screen.getByText(/One step left/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Pick a time" }),
    ).toBeInTheDocument();
  });

  it("shows the scheduled call with a join link", () => {
    renderEditor({
      ...draftProfile,
      status: ProProfileStatus.PendingReview,
      latestVerification: {
        id: "req-1",
        state: VerificationState.Scheduled,
        adminNote: "",
        noShowCount: 0,
        lastBookingOutcome: null,
        booking: {
          id: "booking-1",
          startsAt: new Date("2026-07-21T12:30:00Z").toISOString(),
          endsAt: new Date("2026-07-21T12:45:00Z").toISOString(),
          meetUrl: "https://meet.google.com/abc-defg-hij",
          canReschedule: true,
        },
        createdAt: new Date().toISOString(),
        reviewedAt: null,
      },
    });

    expect(screen.getByRole("link", { name: /Join meeting/ })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
    expect(
      screen.getByRole("link", { name: "Change or withdraw" }),
    ).toBeInTheDocument();
  });

  it("shows the rejection note and allows resubmission", () => {
    renderEditor({
      ...draftProfile,
      status: ProProfileStatus.Rejected,
      latestVerification: {
        id: "req-1",
        state: VerificationState.Rejected,
        adminNote: "No verifiable credentials",
        noShowCount: 0,
        lastBookingOutcome: null,
        booking: null,
        createdAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
      },
    });

    expect(screen.getByText(/No verifiable credentials/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submit for verification" }),
    ).toBeInTheDocument();
  });
});
