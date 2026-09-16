/**
 * Server-side observability for the Next.js process (Node runtime only —
 * never import from a client component). Uses `posthog-node` for server
 * error reports and server-evaluated feature flags; silent without a key.
 */
import { Role, type MeResponse } from "@playwithpro/shared";
import { cookies, headers } from "next/headers";
import {
  PostHog,
  cookieStoreFromHeader,
  readPostHogCookie,
} from "posthog-node";
import type { FlagBootstrap, IdentifiedUser } from "./client";
import { APP_ENVIRONMENT, APP_RELEASE, POSTHOG_KEY } from "./config";
import { CONSENT_COOKIE, parseConsent, type ConsentChoice } from "./consent";
import { ErrorDeduper } from "./error-dedupe";

const POSTHOG_HOST = process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com";
const PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY || undefined;
/** Local flag definitions are refreshed this often. */
const FLAG_POLL_MS = 30_000;
/** A cold flag lookup must not stall a render: code defaults after this. */
const FLAG_TIMEOUT_MS = 300;

/** Dev fixtures and smoke accounts live on these domains. */
const INTERNAL_EMAIL_DOMAINS = ["example.com", "e2e.test"];

let client: PostHog | null | undefined;
const deduper = new ErrorDeduper();

export function serverClient(): PostHog | null {
  if (POSTHOG_KEY === "") return null;
  if (client === undefined) {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      personalApiKey: PERSONAL_API_KEY,
      featureFlagsPollingInterval: FLAG_POLL_MS,
      featureFlagsRequestTimeoutMs: FLAG_TIMEOUT_MS,
      disableGeoip: true,
    });
  }
  return client;
}

/** Drains the queue; wired to SIGTERM from instrumentation.ts. */
export async function shutdownServerClient(): Promise<void> {
  if (client) await client.shutdown(2_000);
}

export interface ServerErrorContext {
  route?: string;
  method?: string;
  source: string;
}

/**
 * Reports a server-side exception with no user identity attached
 * (server errors are not consent-gated: they describe our process).
 */
export function reportServerError(
  error: unknown,
  context: ServerErrorContext,
): boolean {
  const instance = serverClient();
  if (!instance) return false;
  const decision = deduper.decide(error);
  if (!decision.report) return false;
  instance.captureException(error, undefined, {
    ...context,
    environment: APP_ENVIRONMENT,
    release: APP_RELEASE,
    fingerprint: decision.fingerprint,
    occurrences: decision.count,
    $process_person_profile: false,
  });
  return true;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** All flags for a distinct id; `{}` (code defaults) without a key or on timeout. */
export async function flagsFor(
  distinctId: string,
  personProperties: Record<string, string>,
): Promise<Record<string, boolean | string>> {
  const instance = serverClient();
  if (!instance) return {};
  return withTimeout(
    instance.getAllFlags(distinctId, {
      personProperties,
      onlyEvaluateLocally: PERSONAL_API_KEY !== undefined,
      disableGeoip: true,
    }),
    FLAG_TIMEOUT_MS,
    {},
  );
}

export function toIdentifiedUser(
  user: MeResponse,
): IdentifiedUser & { displayName: string; email: string } {
  const domain = user.email.split("@")[1]?.toLowerCase() ?? "";
  return {
    id: user.id,
    role: user.role,
    locale: user.locale,
    internal:
      user.role === Role.Admin || INTERNAL_EMAIL_DOMAINS.includes(domain),
    displayName: user.displayName,
    email: user.email,
  };
}

export interface RequestObservability {
  consent: ConsentChoice | null;
  flags: FlagBootstrap;
}

/**
 * Per-request inputs for the client provider: the consent choice (so the
 * banner renders without a flash) and flags evaluated for the signed-in
 * user or the SDK's anonymous device id (a per-request id otherwise).
 */
export async function observabilityForRequest(
  user: MeResponse | null,
): Promise<RequestObservability> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const consent = parseConsent(cookieStore.get(CONSENT_COOKIE)?.value);
  if (POSTHOG_KEY === "") {
    return { consent, flags: { distinctID: "", featureFlags: {} } };
  }
  const anonymous =
    consent === "granted"
      ? readPostHogCookie(
          cookieStoreFromHeader(headerStore.get("cookie") ?? ""),
          POSTHOG_KEY,
        )?.distinctId
      : undefined;
  const distinctID = user?.id ?? anonymous ?? crypto.randomUUID();
  const featureFlags = await flagsFor(
    distinctID,
    user ? { role: user.role, locale: user.locale } : {},
  );
  return { consent, flags: { distinctID, featureFlags } };
}
