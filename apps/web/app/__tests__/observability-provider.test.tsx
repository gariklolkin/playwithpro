import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { ObservabilityProvider } from "@/components/observability/observability-provider";
import { CONSENT_COOKIE, CONSENT_VERSION } from "@/lib/observability/consent";
import { FLAGS, useFlag } from "@/lib/observability/flags";
import { useSupport } from "@/lib/observability/context";

const client = vi.hoisted(() => ({
  startClient: vi.fn(() => ({})),
  stopClient: vi.fn(),
  identifyUser: vi.fn(),
  resetIdentity: vi.fn(),
  setFlagBootstrap: vi.fn(),
  captureEvent: vi.fn(),
  captureError: vi.fn(() => true),
  flagValue: vi.fn(() => undefined),
  onFlagsChanged: vi.fn(() => () => {}),
  conversations: vi.fn(() => null),
  currentSessionId: vi.fn(() => null),
  setVerifiedIdentity: vi.fn(),
  setPersonProperties: vi.fn(),
}));

vi.mock("@/lib/observability/client", () => client);
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function Probe() {
  const support = useSupport();
  const flag = useFlag(FLAGS.supportPanel, true);
  return (
    <div>
      <span data-testid="support">{String(support.available)}</span>
      <span data-testid="flag">{String(flag)}</span>
      <button onClick={() => support.open({ kind: "menu" })}>
        open support
      </button>
    </div>
  );
}

function renderProvider(
  props: Partial<React.ComponentProps<typeof ObservabilityProvider>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ObservabilityProvider
        enabled
        user={null}
        initialConsent={null}
        flags={{ distinctID: "anon", featureFlags: {} }}
        {...props}
      >
        <Probe />
      </ObservabilityProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ObservabilityProvider", () => {
  it("without a key: no banner, no client, flags at their defaults, no support", () => {
    renderProvider({ enabled: false });

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(client.startClient).not.toHaveBeenCalled();
    expect(client.setFlagBootstrap).not.toHaveBeenCalled();
    expect(screen.getByTestId("support")).toHaveTextContent("false");
    expect(screen.getByTestId("flag")).toHaveTextContent("true");
  });

  it("shows the banner only while no choice exists; declining starts nothing", () => {
    renderProvider();
    expect(screen.getByRole("region")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(client.startClient).not.toHaveBeenCalled();
    expect(document.cookie).toContain(
      `${CONSENT_COOKIE}=${encodeURIComponent(`${CONSENT_VERSION}:denied`)}`,
    );
  });

  it("accepting starts the client immediately and identifies the user", () => {
    renderProvider({
      user: {
        id: "u1",
        role: "amateur",
        locale: "en",
        internal: false,
        displayName: "Player",
        email: "p@example.com",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(client.startClient).toHaveBeenCalledTimes(1);
    expect(client.identifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", role: "amateur", internal: false }),
    );
    expect(document.cookie).toContain(
      encodeURIComponent(`${CONSENT_VERSION}:granted`),
    );
  });

  it("hides the banner for a recorded choice and honours the bootstrapped kill switch", () => {
    renderProvider({
      initialConsent: "granted",
      flags: {
        distinctID: "anon",
        featureFlags: { [FLAGS.supportPanel]: false },
      },
    });

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(client.startClient).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("flag")).toHaveTextContent("false");
    expect(screen.getByTestId("support")).toHaveTextContent("false");
  });

  it("opens the support panel from an entry point", () => {
    renderProvider({ initialConsent: "granted" });

    expect(screen.getByTestId("support")).toHaveTextContent("true");
    fireEvent.click(screen.getByRole("button", { name: "open support" }));

    expect(screen.getByRole("dialog", { name: /Support/ })).toBeInTheDocument();
  });
});
