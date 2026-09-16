/**
 * Browser twin of apps/api/src/observability/error-dedupe.ts: one report per
 * fingerprint per window (carrying the count) and a hard cap per minute per
 * page, so a crashing render or a reconnect loop cannot exhaust the monthly
 * allowance. Uses a string hash instead of Node's crypto.
 */
export const DEDUPE_WINDOW_MS = 60_000;
export const MAX_REPORTS_PER_MINUTE = 30;

export interface DedupeDecision {
  report: boolean;
  fingerprint: string;
  count: number;
}

interface Seen {
  count: number;
  firstAt: number;
}

export class ErrorDeduper {
  private readonly seen = new Map<string, Seen>();
  private minuteStart = 0;
  private minuteCount = 0;

  constructor(
    private readonly windowMs = DEDUPE_WINDOW_MS,
    private readonly maxPerMinute = MAX_REPORTS_PER_MINUTE,
  ) {}

  decide(error: unknown, now = Date.now()): DedupeDecision {
    const fingerprint = fingerprintOf(error);
    const entry = this.seen.get(fingerprint);
    if (entry && now - entry.firstAt < this.windowMs) {
      entry.count += 1;
      return { report: false, fingerprint, count: entry.count };
    }
    this.seen.set(fingerprint, { count: 1, firstAt: now });

    if (now - this.minuteStart >= 60_000) {
      this.minuteStart = now;
      this.minuteCount = 0;
    }
    if (this.minuteCount >= this.maxPerMinute) {
      return { report: false, fingerprint, count: 1 };
    }
    this.minuteCount += 1;
    return { report: true, fingerprint, count: 1 };
  }
}

/** FNV-1a over `name + message + top frame`. */
export function fingerprintOf(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  const topFrame =
    error instanceof Error && error.stack
      ? (error.stack
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.startsWith("at ") || line.includes("@")) ?? "")
      : "";
  return fnv1a(`${name}\n${message}\n${topFrame}`);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
