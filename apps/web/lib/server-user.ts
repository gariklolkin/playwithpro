import type { MeResponse } from "@playwithpro/shared";
import { cookies } from "next/headers";
import { serverApiUrl } from "./api";

/**
 * Fetches the signed-in user from the API by forwarding the request cookies.
 * Returns null for guests or when the access token is missing/expired —
 * client-side silent refresh takes it from there.
 */
export async function getCurrentUser(): Promise<MeResponse | null> {
  const cookieStore = await cookies();
  if (!cookieStore.has("access_token")) {
    return null;
  }

  try {
    const response = await fetch(`${serverApiUrl()}/users/me`, {
      headers: { Cookie: cookieStore.toString() },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as MeResponse;
  } catch {
    return null;
  }
}

/** GET an API resource with the request cookies forwarded; null on any failure. */
export async function serverApiGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  try {
    const response = await fetch(`${serverApiUrl()}${path}`, {
      headers: { Cookie: cookieStore.toString() },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
