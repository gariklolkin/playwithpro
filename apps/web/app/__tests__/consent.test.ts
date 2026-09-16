import { describe, expect, it } from "vitest";
import {
  CONSENT_VERSION,
  consentFromCookieHeader,
  parseConsent,
  serializeConsent,
} from "@/lib/observability/consent";
import { clampRate } from "@/lib/observability/config";

describe("consent cookie", () => {
  it("round-trips the current version", () => {
    expect(parseConsent(serializeConsent("granted"))).toBe("granted");
    expect(parseConsent(serializeConsent("denied"))).toBe("denied");
  });

  it("treats an older version or garbage as no choice (re-ask)", () => {
    expect(parseConsent(`${CONSENT_VERSION - 1}:granted`)).toBeNull();
    expect(parseConsent("granted")).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent(`${CONSENT_VERSION}:maybe`)).toBeNull();
  });

  it("finds the choice in a cookie header", () => {
    expect(
      consentFromCookieHeader(
        `access_token=abc; pwp_consent=${encodeURIComponent(`${CONSENT_VERSION}:denied`)}; x=1`,
      ),
    ).toBe("denied");
    expect(consentFromCookieHeader("access_token=abc")).toBeNull();
  });
});

describe("clampRate", () => {
  it("parses the replay sample rate with a safe default", () => {
    expect(clampRate(undefined, 0.5)).toBe(0.5);
    expect(clampRate("", 0.5)).toBe(0.5);
    expect(clampRate("abc", 0.5)).toBe(0.5);
    expect(clampRate("0.1", 0.5)).toBe(0.1);
    expect(clampRate("7", 0.5)).toBe(1);
    expect(clampRate("-1", 0.5)).toBe(0);
  });
});
