import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { SupportPanel } from "@/components/support/support-panel";
import {
  ObservabilityContext,
  DEFAULT_OBSERVABILITY,
  type ObservabilityContextValue,
} from "@/lib/observability/context";
import { SUPPORT_POLL_MS } from "@/lib/observability/support";

const api = vi.hoisted(() => ({
  isAvailable: vi.fn(() => true),
  getCurrentTicketId: vi.fn<() => string | null>(() => null),
  sendMessage: vi.fn(async () => ({ ticket_id: "t1", message_id: "m1" })),
  getMessages: vi.fn(async () => ({
    ticket_id: "t1",
    ticket_status: "open",
    messages: [
      {
        id: "m1",
        content: "[error] error abc\n\nIt broke",
        author_type: "customer",
        created_at: "2026-09-16T10:00:00Z",
        is_private: false,
      },
      {
        id: "m2",
        content: "internal note",
        author_type: "human",
        created_at: "2026-09-16T10:01:00Z",
        is_private: true,
      },
      {
        id: "m3",
        content: "On it!",
        author_type: "human",
        author_name: "Garik",
        created_at: "2026-09-16T10:02:00Z",
        is_private: false,
      },
    ],
  })),
  markAsRead: vi.fn(async () => ({})),
}));

const client = vi.hoisted(() => ({
  conversations: vi.fn(() => api),
  currentSessionId: vi.fn(() => "replay-1"),
  setVerifiedIdentity: vi.fn(),
  setPersonProperties: vi.fn(),
}));

vi.mock("@/lib/observability/client", () => client);

const fetchMock = vi.fn();

function renderPanel(
  overrides: Partial<ObservabilityContextValue> = {},
  onClose = vi.fn(),
) {
  const value: ObservabilityContextValue = {
    ...DEFAULT_OBSERVABILITY,
    enabled: true,
    consent: "granted",
    supportAvailable: true,
    ...overrides,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ObservabilityContext.Provider value={value}>
        <SupportPanel
          context={{ kind: "error", errorId: "abc" }}
          onClose={onClose}
        />
      </ObservabilityContext.Provider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  api.getCurrentTicketId.mockReturnValue(null);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ userId: "u1", hash: "h" }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SupportPanel", () => {
  it("asks for consent (with the email fallback) when capture is declined", () => {
    const grant = vi.fn();
    renderPanel({ consent: "denied", grant });

    fireEvent.click(
      screen.getByRole("button", { name: "Accept and open chat" }),
    );

    expect(grant).toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "support@play-with.pro" }),
    ).toBeInTheDocument();
    expect(api.getMessages).not.toHaveBeenCalled();
  });

  it("verifies a signed-in user, sends with the entry-point context and shows replies", async () => {
    renderPanel({
      user: {
        id: "u1",
        role: "amateur",
        locale: "en",
        internal: false,
        displayName: "Anna",
        email: "anna@example.com",
      },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/support/identity"),
      expect.anything(),
    );
    expect(client.setVerifiedIdentity).toHaveBeenCalledWith("u1", "h");
    expect(client.setPersonProperties).toHaveBeenCalledWith({
      email: "anna@example.com",
    });
    // No email field for signed-in users.
    expect(screen.queryByLabelText("Your email")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Describe the problem…"), {
      target: { value: "It broke" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(api.sendMessage).toHaveBeenCalledWith(
      "[error] · error abc · replay replay-1\n\nIt broke",
      { email: undefined, name: "Anna" },
    );
    // The ticket now exists: the post-send refresh and the next poll show replies.
    api.getCurrentTicketId.mockReturnValue("t1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS);
    });
    expect(screen.getByText("On it!")).toBeInTheDocument();
    expect(screen.queryByText("internal note")).not.toBeInTheDocument();
  });

  it("requires an email from anonymous visitors before the first message", async () => {
    renderPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    fireEvent.change(screen.getByLabelText("Describe the problem…"), {
      target: { value: "Hello" },
    });
    await act(async () => {
      fireEvent.submit(
        screen.getByLabelText("Describe the problem…").closest("form")!,
      );
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.sendMessage).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Your email"), {
      target: { value: "v@example.com" },
    });
    await act(async () => {
      fireEvent.submit(
        screen.getByLabelText("Describe the problem…").closest("form")!,
      );
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.sendMessage).toHaveBeenCalledWith(expect.any(String), {
      email: "v@example.com",
      name: undefined,
    });
  });

  it("polls for replies only while open and stops on close", async () => {
    api.getCurrentTicketId.mockReturnValue("t1");
    const { unmount } = renderPanel();
    // Two rounds: the availability probe fires first, then the initial fetch
    // scheduled by the effect that its state change triggers.
    for (let round = 0; round < 2; round++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
    }
    expect(api.getMessages).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS);
    });
    expect(api.getMessages).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS * 3);
    });
    expect(api.getMessages).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderPanel({}, onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
