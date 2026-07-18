import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProProfileStatus, type ProProfileResponse } from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { ProProfileEditor } from "@/components/pros/pro-profile-editor";

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
  achievements: "",
  languages: [],
  country: "",
  city: "",
  services: [],
  latestVerification: null,
};

function renderEditor(profile: ProProfileResponse = draftProfile) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProProfileEditor initialProfile={profile} />
    </NextIntlClientProvider>,
  );
}

describe("ProProfileEditor", () => {
  it("saves the about section with selected languages", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...draftProfile, bio: "20 years of coaching" }),
    });
    renderEditor();

    fireEvent.change(screen.getByLabelText("Bio"), {
      target: { value: "20 years of coaching" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "English" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Deutsch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
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

  it("shows the API error when the game service misses a venue", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          message:
            "The in-person game service requires a city and a club/venue.",
        }),
    });
    renderEditor();

    fireEvent.click(screen.getByRole("checkbox", { name: /Practice game/ }));
    fireEvent.change(screen.getByLabelText("Hourly rate"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/requires a city and a club/),
    ).toBeInTheDocument();
  });

  it("submits verification with credentials and one link per line", async () => {
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

    fireEvent.change(screen.getByLabelText("Credentials"), {
      target: { value: "National champion 2019" },
    });
    fireEvent.change(screen.getByLabelText("Evidence links (one per line)"), {
      target: { value: "https://a.example\n\nhttps://b.example\n" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for verification" }),
    );

    expect(await screen.findByText(/Under review/)).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/pros/me/verification"),
    );
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      credentials: "National champion 2019",
      links: ["https://a.example", "https://b.example"],
    });
  });

  it("shows the rejection note and allows resubmission", () => {
    renderEditor({
      ...draftProfile,
      status: ProProfileStatus.Rejected,
      latestVerification: {
        id: "req-1",
        status: "rejected" as never,
        credentials: "x",
        links: [],
        adminNote: "No verifiable credentials",
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
