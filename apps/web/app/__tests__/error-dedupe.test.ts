import { describe, expect, it } from "vitest";
import { ErrorDeduper, fingerprintOf } from "@/lib/observability/error-dedupe";

describe("ErrorDeduper (web)", () => {
  it("reports once per fingerprint per window with a running count", () => {
    const deduper = new ErrorDeduper(60_000, 30);
    const error = new Error("socket closed");

    expect(deduper.decide(error, 0).report).toBe(true);
    for (let i = 1; i <= 50; i++) {
      expect(deduper.decide(error, i * 100).report).toBe(false);
    }
    expect(deduper.decide(error, 60_001)).toMatchObject({
      report: true,
      count: 1,
    });
  });

  it("caps distinct reports per minute", () => {
    const deduper = new ErrorDeduper(60_000, 2);
    const sent = [0, 1, 2, 3].map((i) =>
      deduper.decide(new Error(`e${i}`), 1_000 + i),
    );
    expect(sent.filter((d) => d.report)).toHaveLength(2);
  });

  it("fingerprints by name, message and top frame", () => {
    const a = new TypeError("x is undefined");
    const b = new TypeError("x is undefined");
    b.stack = "TypeError: x is undefined\n    at other (file.js:9:1)";
    expect(fingerprintOf(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
    expect(fingerprintOf("plain")).toBe(fingerprintOf("plain"));
  });
});
