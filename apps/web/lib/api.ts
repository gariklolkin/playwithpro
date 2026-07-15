/** Base URL of the API as seen from the browser. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Base URL of the API as seen from the Next.js server process
 * (inside Docker the API is reachable as a service name, not localhost).
 */
export function serverApiUrl(): string {
  return process.env.API_URL_INTERNAL ?? API_URL;
}

/**
 * Browser fetch against the API. Sends cookies; on a 401 it attempts one
 * silent refresh-token rotation and retries the original request.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const request = (): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
      ...init,
    });

  const response = await request();
  if (response.status !== 401 || path.startsWith("/auth/")) {
    return response;
  }

  const refreshed = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!refreshed.ok) {
    return response;
  }
  return request();
}
