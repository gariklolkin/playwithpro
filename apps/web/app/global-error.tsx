"use client";

import { useEffect, useMemo } from "react";
import { errorIdOf, reportError } from "@/lib/observability/errors";

/**
 * Root failure (the locale layout itself threw): no intl provider is
 * guaranteed, so the copy is English; the report still carries the id.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorId = useMemo(() => errorIdOf(error), [error]);

  useEffect(() => {
    reportError(error, { source: "global-boundary", errorId });
  }, [error, errorId]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: "#37352f",
          margin: 0,
          padding: "64px 20px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 36 }}>⚠️</div>
        <h1 style={{ fontSize: 20, margin: "12px 0 4px" }}>
          Something went wrong
        </h1>
        <p style={{ color: "#787774", fontSize: 14, margin: 0 }}>
          The page could not be displayed. Please try again.
        </p>
        <p style={{ color: "#9b9a97", fontSize: 12, marginTop: 12 }}>
          Reference: {errorId}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 24,
            background: "#37352f",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            padding: "9px 14px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
