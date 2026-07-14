import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "../page";

describe("Home", () => {
  it("renders the hero headline", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        name: /where amateurs and pros play together/i,
      }),
    ).toBeInTheDocument();
  });
});
