import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserMenu } from "@/components/user-menu";
import { feedbackUrl } from "@/lib/feedback-url";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/use-settings-href", () => ({
  useSettingsHref: () => "/dashboard?settings=profile",
}));

afterEach(() => vi.clearAllMocks());

const labels = {
  settings: "Settings",
  privacy: "Privacy",
  support: "Contact support",
  suggestIdea: "Suggest an idea",
  logout: "Log out",
};

describe("feedbackUrl", () => {
  it("returns null without a configured board", () => {
    expect(feedbackUrl("user-menu", "")).toBeNull();
    expect(feedbackUrl("user-menu", "   ")).toBeNull();
    expect(feedbackUrl("user-menu", "not a url")).toBeNull();
  });

  it("appends the source and placement", () => {
    expect(
      feedbackUrl("coach-dashboard", "https://feedback.play-with.pro"),
    ).toBe(
      "https://feedback.play-with.pro/?utm_source=app&utm_content=coach-dashboard",
    );
    expect(
      feedbackUrl("user-menu", "https://feedback.play-with.pro/?ref=x"),
    ).toBe(
      "https://feedback.play-with.pro/?ref=x&utm_source=app&utm_content=user-menu",
    );
  });
});

describe("UserMenu idea link", () => {
  it("renders no board link when the URL is not configured (test build)", () => {
    render(<UserMenu displayName="Anna" avatarUrl={null} labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Anna" }));
    expect(screen.queryByText(/Suggest an idea/)).not.toBeInTheDocument();
    expect(screen.getByText("Privacy")).toBeInTheDocument();
  });
});
