import { createHash } from 'node:crypto';

/** One report per fingerprint per window; the report carries the count. */
export const DEDUPE_WINDOW_MS = 60_000;
/** Hard cap of reports per minute per process, whatever the fingerprints. */
export const MAX_REPORTS_PER_MINUTE = 30;

interface Seen {
  count: number;
  firstAt: number;
}

export interface DedupeDecision {
  /** Whether this occurrence should be sent to the vendor. */
  report: boolean;
  fingerprint: string;
  /** Occurrences of this fingerprint in the current window, including this one. */
  count: number;
}

/**
 * Suppresses repeats of the same error within a short window and caps the
 * total number of reports per minute, so a reconnect loop or a crashing
 * render cannot exhaust the monthly allowance. Shared algorithm with the web
 * reporter (apps/web/lib/observability/error-dedupe.ts).
 */
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
    this.evict(now);

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

  private evict(now: number): void {
    if (this.seen.size < 512) return;
    for (const [key, entry] of this.seen) {
      if (now - entry.firstAt >= this.windowMs) this.seen.delete(key);
    }
  }
}

/** `sha1(name + message + top frame)`: stable across occurrences, distinct across call sites. */
export function fingerprintOf(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  const topFrame =
    error instanceof Error && error.stack
      ? (error.stack
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line.startsWith('at ')) ?? '')
      : '';
  return createHash('sha1')
    .update(`${name}\n${message}\n${topFrame}`)
    .digest('hex');
}
