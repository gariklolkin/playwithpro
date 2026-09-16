/**
 * Strips secrets from URLs before they reach the vendor: password-reset and
 * email-confirmation codes, LiveKit access tokens, pre-signed object-storage
 * signatures. Applied to `$current_url` / `$pathname` on every event and to
 * captured network requests in session replay.
 */
const SECRET_PARAMS = new Set(["code", "token", "access_token"]);
const SECRET_PREFIXES = ["x-amz-"];

export function isSecretParam(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    SECRET_PARAMS.has(lower) ||
    SECRET_PREFIXES.some((prefix) => lower.startsWith(prefix))
  );
}

/** Replaces the value of every secret query parameter with `[redacted]`. */
export function scrubUrl(input: string): string {
  const queryStart = input.indexOf("?");
  if (queryStart === -1) return input;
  const hashStart = input.indexOf("#", queryStart);
  const query = input.slice(
    queryStart + 1,
    hashStart === -1 ? undefined : hashStart,
  );
  if (query === "") return input;
  const scrubbed = query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      const name = eq === -1 ? pair : pair.slice(0, eq);
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        // Keep the raw name; an undecodable name is not one of ours.
      }
      return isSecretParam(decoded) ? `${name}=[redacted]` : pair;
    })
    .join("&");
  return (
    input.slice(0, queryStart + 1) +
    scrubbed +
    (hashStart === -1 ? "" : input.slice(hashStart))
  );
}

/** Scrubs every string-valued URL property the SDK attaches to an event. */
export function scrubUrlProperties<T extends Record<string, unknown>>(
  properties: T,
): T {
  const out: Record<string, unknown> = { ...properties };
  for (const key of [
    "$current_url",
    "$pathname",
    "$referrer",
    "$initial_current_url",
  ]) {
    const value = out[key];
    if (typeof value === "string") out[key] = scrubUrl(value);
  }
  return out as T;
}
