"use client";

/**
 * The only file in the web app that touches `posthog-js`. Everything else
 * (analytics, errors, flags, support, consent UI) goes through the helpers
 * exported here, so the vendor can be swapped and the no-key path stays a
 * guaranteed no-op: the SDK is initialised only once consent is granted, so
 * a visitor who declined (or has not answered yet) causes zero requests.
 */
import posthog, { type PostHog, type Properties } from "posthog-js";
import {
  APP_ENVIRONMENT,
  APP_RELEASE,
  POSTHOG_KEY,
  POSTHOG_PROXY_PATH,
  POSTHOG_UI_HOST,
  REPLAY_SAMPLE_RATE,
  isObservabilityEnabled,
} from "./config";
import { ErrorDeduper } from "./error-dedupe";
import { scrubUrl, scrubUrlProperties } from "./url-scrub";

export interface FlagBootstrap {
  distinctID: string;
  featureFlags: Record<string, boolean | string>;
}

export interface IdentifiedUser {
  id: string;
  role: string;
  locale: string;
  /** Admins and dev-fixture accounts: excluded from analysis vendor-side. */
  internal: boolean;
}

type ClientState = "idle" | "started";

let state: ClientState = "idle";
let bootstrap: FlagBootstrap | undefined;
const deduper = new ErrorDeduper();

/** Remembered for a later `start()` (consent granted after the first render). */
export function setFlagBootstrap(next: FlagBootstrap | undefined): void {
  bootstrap = next;
}

export function isClientStarted(): boolean {
  return state === "started";
}

/**
 * Initialises the SDK with capture on: called exactly when consent is (or
 * already was) granted. Pageviews start with the current page.
 */
export function startClient(): PostHog | null {
  if (!isObservabilityEnabled() || typeof window === "undefined") return null;
  if (state === "started") return posthog;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_PROXY_PATH,
    ui_host: POSTHOG_UI_HOST,
    persistence: "localStorage+cookie",
    capture_pageview: "history_change",
    capture_pageleave: true,
    // Named funnel events only: autocapture would multiply the event volume
    // for no funnel value on the free tier.
    autocapture: false,
    capture_exceptions: true,
    disable_surveys: true,
    disable_web_experiments: true,
    bootstrap,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
      recordCrossOriginIframes: false,
      sampleRate: REPLAY_SAMPLE_RATE,
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: scrubUrl(request.name),
        requestBody: undefined,
        responseBody: undefined,
      }),
    },
    before_send: (event) =>
      event
        ? { ...event, properties: scrubUrlProperties(event.properties) }
        : event,
    loaded: (instance) => {
      instance.register({
        environment: APP_ENVIRONMENT,
        release: APP_RELEASE,
      });
    },
  });
  state = "started";
  return posthog;
}

/**
 * Consent revoked: stop capture and replay, forget the device identity and
 * clear persistence. The SDK stays loaded but silent for this page; the
 * next navigation renders without it.
 */
export function stopClient(): void {
  if (state !== "started") return;
  posthog.stopSessionRecording();
  posthog.opt_out_capturing();
  posthog.reset();
  state = "idle";
}

export function identifyUser(user: IdentifiedUser): void {
  if (state !== "started") return;
  posthog.identify(user.id, {
    role: user.role,
    locale: user.locale,
    internal: user.internal,
  });
}

/** Sign-out: subsequent events belong to a fresh anonymous device id. */
export function resetIdentity(): void {
  if (state !== "started") return;
  posthog.reset();
}

export function captureEvent(event: string, properties?: Properties): void {
  if (state !== "started") return;
  posthog.capture(event, properties);
}

/** Deduplicated exception report; returns whether it was sent. */
export function captureError(error: unknown, properties?: Properties): boolean {
  const decision = deduper.decide(error);
  if (!decision.report || state !== "started") return false;
  posthog.captureException(error, {
    ...properties,
    fingerprint: decision.fingerprint,
    occurrences: decision.count,
  });
  return true;
}

export function flagValue(name: string): boolean | string | undefined {
  if (state !== "started") return undefined;
  return posthog.getFeatureFlag(name);
}

/** Subscribes to flag refreshes; returns an unsubscribe. No-op before start. */
export function onFlagsChanged(callback: () => void): () => void {
  if (state !== "started") return () => {};
  return posthog.onFeatureFlags(() => callback());
}

/** The vendor's support surface; `null` before start or when unavailable. */
export function conversations(): PostHog["conversations"] | null {
  if (state !== "started") return null;
  return posthog.conversations;
}

/** Server-verified identity for support tickets (design decision 9). */
export function setVerifiedIdentity(userId: string, hash: string): void {
  if (state !== "started") return;
  posthog.setIdentity(userId, hash);
}

export function setPersonProperties(properties: Properties): void {
  if (state !== "started") return;
  posthog.setPersonProperties(properties);
}

export function currentSessionId(): string | null {
  if (state !== "started") return null;
  return posthog.get_session_id() || null;
}

/** Test seam: forget the module state between vitest cases. */
export function resetClientForTests(): void {
  state = "idle";
  bootstrap = undefined;
}
