import type { Instrumentation } from "next";

/**
 * Next.js server instrumentation: warms the server-side reporter and
 * reports request errors thrown by server components / route handlers.
 * Node runtime only — the Edge runtime (middleware) gets no reporter.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { serverClient, shutdownServerClient } =
    await import("./lib/observability/server");
  if (serverClient()) {
    process.once("SIGTERM", () => void shutdownServerClient());
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("./lib/observability/server");
  reportServerError(error, {
    route: context.routePath,
    method: request.method,
    source: `server:${context.routerKind}:${context.routeType}`,
  });
};
