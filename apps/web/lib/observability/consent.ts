/**
 * Consent for browser-side capture. A first-party cookie records the choice
 * (`pwp_consent=<version>:granted|denied`, 365 days); the version bumps when
 * the consent text changes materially, which re-asks everyone. The cookie is
 * readable by the server, so the layout renders the banner (or not) without
 * a flash.
 */
export const CONSENT_COOKIE = "pwp_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export type ConsentChoice = "granted" | "denied";

/** Parses a raw cookie value; anything but the current version counts as no choice. */
export function parseConsent(
  raw: string | undefined | null,
): ConsentChoice | null {
  if (!raw) return null;
  const [version, choice] = raw.split(":");
  if (Number(version) !== CONSENT_VERSION) return null;
  return choice === "granted" || choice === "denied" ? choice : null;
}

export function serializeConsent(choice: ConsentChoice): string {
  return `${CONSENT_VERSION}:${choice}`;
}

/** Finds the consent cookie in a `document.cookie` / `Cookie` header string. */
export function consentFromCookieHeader(header: string): ConsentChoice | null {
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== CONSENT_COOKIE) continue;
    try {
      return parseConsent(decodeURIComponent(pair.slice(eq + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

/** Client only: reads the current choice from the browser cookie jar. */
export function readConsentCookie(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  return consentFromCookieHeader(document.cookie);
}

/** Client only: persists the choice for a year, first-party, Lax. */
export function writeConsentCookie(choice: ConsentChoice): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(
    serializeConsent(choice),
  )}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}
