import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import Home from "../[locale]/page";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: string) =>
    Promise.resolve(
      createTranslator({
        locale: "en",
        messages,
        namespace: namespace as never,
      }),
    ),
}));

describe("Home", () => {
  it("renders the hero headline from the message catalog", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {await Home()}
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: /where amateurs and\s*pros\s*play together/i,
      }),
    ).toBeInTheDocument();
  });
});
