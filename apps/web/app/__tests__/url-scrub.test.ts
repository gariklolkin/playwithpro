import { describe, expect, it } from "vitest";
import { scrubUrl, scrubUrlProperties } from "@/lib/observability/url-scrub";

describe("scrubUrl", () => {
  it("redacts password-reset and confirmation codes", () => {
    expect(
      scrubUrl("https://play-with.pro/reset-password?code=123456&x=1"),
    ).toBe("https://play-with.pro/reset-password?code=[redacted]&x=1");
    expect(scrubUrl("/verify-email?token=abc")).toBe(
      "/verify-email?token=[redacted]",
    );
  });

  it("redacts LiveKit access tokens and pre-signed S3 signatures", () => {
    expect(scrubUrl("wss://meet.play-with.pro/rtc?access_token=eyJ.x.y")).toBe(
      "wss://meet.play-with.pro/rtc?access_token=[redacted]",
    );
    const signed =
      "https://s3.example/videos/v1/playback.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F1&X-Amz-Signature=deadbeef&response-content-type=video%2Fmp4";
    expect(scrubUrl(signed)).toBe(
      "https://s3.example/videos/v1/playback.mp4?X-Amz-Algorithm=[redacted]&X-Amz-Credential=[redacted]&X-Amz-Signature=[redacted]&response-content-type=video%2Fmp4",
    );
  });

  it("leaves ordinary URLs, hashes and dotless params alone", () => {
    expect(scrubUrl("/coaches?languages=en,de&page=2#top")).toBe(
      "/coaches?languages=en,de&page=2#top",
    );
    expect(scrubUrl("/dashboard")).toBe("/dashboard");
    expect(scrubUrl("/x?code=1#code=2")).toBe("/x?code=[redacted]#code=2");
  });

  it("scrubs every URL-valued event property", () => {
    expect(
      scrubUrlProperties({
        $current_url: "https://play-with.pro/reset-password?code=9",
        $pathname: "/reset-password?code=9",
        $referrer: "https://google.com/?q=x",
        other: 1,
      }),
    ).toEqual({
      $current_url: "https://play-with.pro/reset-password?code=[redacted]",
      $pathname: "/reset-password?code=[redacted]",
      $referrer: "https://google.com/?q=x",
      other: 1,
    });
  });
});
