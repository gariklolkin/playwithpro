// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "../../middleware";

describe("middleware", () => {
  it("redirects signed-out visitors to /login preserving the destination", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/settings/account"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fsettings%2Faccount",
    );
  });

  it("redirects from /dashboard when no access token cookie is present", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "/login?next=%2Fdashboard",
    );
  });

  it("lets requests with an access token cookie through", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/dashboard", {
        headers: { cookie: "access_token=jwt" },
      }),
    );

    expect(response.headers.get("location")).toBeNull();
  });
});
