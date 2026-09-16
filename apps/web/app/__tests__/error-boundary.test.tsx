import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import LocaleError from "../[locale]/error";
import {
  ObservabilityContext,
  DEFAULT_OBSERVABILITY,
} from "@/lib/observability/context";

const client = vi.hoisted(() => ({
  captureError: vi.fn(() => true),
}));
vi.mock("@/lib/observability/client", () => client);
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => vi.clearAllMocks());

describe("locale error boundary", () => {
  it("renders the localized screen, reports once with the digest, and offers support", () => {
    const openSupport = vi.fn();
    const reset = vi.fn();
    const error = Object.assign(new Error("render failed"), {
      digest: "dg-42",
    });

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ObservabilityContext.Provider
          value={{
            ...DEFAULT_OBSERVABILITY,
            enabled: true,
            supportAvailable: true,
            openSupport,
          }}
        >
          <LocaleError error={error} reset={reset} />
        </ObservabilityContext.Provider>
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Reference: dg-42")).toBeInTheDocument();
    expect(client.captureError).toHaveBeenCalledTimes(1);
    expect(client.captureError).toHaveBeenCalledWith(error, {
      source: "route-boundary",
      locale: "en",
      errorId: "dg-42",
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Contact support/ }));
    expect(openSupport).toHaveBeenCalledWith({
      kind: "error",
      errorId: "dg-42",
    });
  });

  it("hides the support button when support is unavailable", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LocaleError error={new Error("x")} reset={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(
      screen.queryByRole("button", { name: /Contact support/ }),
    ).not.toBeInTheDocument();
  });
});
