import {
  PlayerLevel,
  Role,
  type MeResponse,
  type PlayerProfileResponse,
} from "@playwithpro/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { PlayerProfileEditor } from "@/components/players/player-profile-editor";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/settings/avatar-uploader", () => ({
  AvatarUploader: () => <div data-testid="avatar-uploader" />,
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
  email: "anna@example.com",
  role: Role.Amateur,
  displayName: "Anna",
  locale: "en",
  timezone: "UTC",
  emailVerified: true,
  hasPassword: true,
  googleLinked: false,
  avatarUrl: null,
};

const unfilled: PlayerProfileResponse = {
  id: "pp-1",
  filled: false,
  level: PlayerLevel.Beginner,
  style: null,
  yearsOfExperience: null,
  handedness: null,
  grip: null,
  about: "",
};

describe("PlayerProfileEditor preview", () => {
  it("explains visibility and previews the unfilled card until the first save", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...unfilled,
        filled: true,
        level: PlayerLevel.Advanced,
        about: "Loop drills",
      }),
    });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlayerProfileEditor initialProfile={unfilled} initialUser={user} />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByText(/Coaches you book can see your playing details/),
    ).toBeInTheDocument();
    expect(screen.getByText("How coaches see you")).toBeInTheDocument();
    const card = screen.getByTestId("player-card");
    expect(card).toHaveTextContent("hasn't filled in a profile yet");
    expect(card).not.toHaveTextContent("Beginner");

    fireEvent.change(screen.getByLabelText("Playing level"), {
      target: { value: PlayerLevel.Advanced },
    });
    fireEvent.change(screen.getByLabelText("About you"), {
      target: { value: "Loop drills" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(screen.getByTestId("player-card")).toHaveTextContent("Advanced"),
    );
    expect(screen.getByTestId("player-card")).toHaveTextContent("Loop drills");
    expect(screen.getByTestId("player-card")).not.toHaveTextContent(
      "hasn't filled in a profile yet",
    );
  });
});
