import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { UnsubscribeView } from "@/components/notifications/unsubscribe-view";
import { NotificationsSettingsPanel } from "@/components/settings/panels/notifications-settings-panel";
import { normalizeSettingsTab } from "@/lib/settings-dialog-url";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
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

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("settings tabs", () => {
  it("knows the notifications tab", () => {
    expect(normalizeSettingsTab("notifications")).toBe("notifications");
  });
});

describe("NotificationsSettingsPanel", () => {
  it("loads the preferences and saves a toggle on change", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          emailReminders: true,
          emailClipChanges: true,
          emailReviews: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          emailReminders: false,
          emailClipChanges: true,
          emailReviews: false,
        }),
      });
    wrap(<NotificationsSettingsPanel />);

    const reminders = await screen.findByLabelText(/Session reminders/);
    expect(reminders).toBeChecked();
    expect(screen.getByLabelText(/New reviews/)).not.toBeChecked();

    fireEvent.click(reminders);
    await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/users/me/notifications"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ emailReminders: false }),
      }),
    );
    expect(screen.getByLabelText(/Session reminders/)).not.toBeChecked();
    expect(screen.getByText(/always emailed/)).toBeInTheDocument();
  });
});

describe("UnsubscribeView", () => {
  it("posts the token and confirms the category", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ category: "emailReminders" }),
    });
    wrap(<UnsubscribeView token="abc.def" />);

    await waitFor(() =>
      expect(screen.getByTestId("unsubscribe-status")).toHaveTextContent(
        "Session reminder emails are now off for your account.",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/notifications/unsubscribe"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "abc.def" }),
      }),
    );
    expect(
      screen.getByRole("link", { name: "Open notification settings" }),
    ).toHaveAttribute("href", "/dashboard?settings=notifications");
  });

  it("explains an invalid or missing token", async () => {
    wrap(<UnsubscribeView token={null} />);
    expect(screen.getByTestId("unsubscribe-status")).toHaveTextContent(
      /invalid or has expired/,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({}),
    });
    wrap(<UnsubscribeView token="bad" />);
    await waitFor(() =>
      expect(screen.getAllByTestId("unsubscribe-status")[1]).toHaveTextContent(
        /invalid/,
      ),
    );
  });
});
