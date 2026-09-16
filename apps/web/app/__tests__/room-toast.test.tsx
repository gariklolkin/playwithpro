import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RoomToasts,
  type RoomToastItem,
} from "@/components/sessions/room-toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
});

const toast: RoomToastItem = {
  id: "ten",
  text: "10 minutes left",
  durationMs: 8_000,
};

describe("RoomToasts", () => {
  it("renders politely, dismisses on click and auto-dismisses", () => {
    const onDismiss = vi.fn();
    render(
      <RoomToasts
        toasts={[toast]}
        onDismiss={onDismiss}
        dismissLabel="Dismiss"
      />,
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("10 minutes left");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("ten");

    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("portals into the fullscreen element when one is active", () => {
    const card = document.createElement("div");
    card.setAttribute("data-testid", "fullscreen-card");
    document.body.appendChild(card);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: card,
    });
    render(
      <RoomToasts
        toasts={[toast]}
        onDismiss={vi.fn()}
        dismissLabel="Dismiss"
      />,
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(card).toContainElement(screen.getByTestId("room-toast"));

    // Leaving fullscreen moves the stack back to the body.
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(card).not.toContainElement(screen.getByTestId("room-toast"));
    card.remove();
  });
});
