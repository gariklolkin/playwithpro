"use client";

import { captureError } from "./client";

export interface ErrorReportContext {
  /** Where the error surfaced: `route-boundary`, `global-boundary`, … */
  source: string;
  locale?: string;
  /** Next.js server-error digest or a client-generated id for support. */
  errorId?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Reports a caught exception (deduplicated, rate-limited). Environment and
 * release ride along as registered super-properties. Returns whether the
 * report was sent, so callers can decide what to show.
 */
export function reportError(
  error: unknown,
  context: ErrorReportContext,
): boolean {
  return captureError(error, context);
}

/** A stable id for a caught error: the server digest when present. */
export function errorIdOf(error: unknown): string {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest !== "") return digest;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10);
}
