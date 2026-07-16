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

  it("keeps the locale prefix when redirecting to login", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/ru/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/ru/login?next=%2Fru%2Fdashboard",
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

  it("lets prefixed protected requests with an access token through", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/de/settings/account", {
        headers: { cookie: "access_token=jwt" },
      }),
    );

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects unprefixed URLs to the cookie locale's prefixed URL", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/login", {
        headers: { cookie: "NEXT_LOCALE=ru" },
      }),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/ru/login",
    );
  });

  it("serves default-locale pages unprefixed without redirecting", () => {
    const response = middleware(new NextRequest("http://localhost:3000/login"));

    expect(response.headers.get("location")).toBeNull();
  });
});
