"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { SupportPanel } from "@/components/support/support-panel";
import {
  identifyUser,
  resetIdentity,
  setFlagBootstrap,
  startClient,
  stopClient,
  type FlagBootstrap,
} from "@/lib/observability/client";
import {
  writeConsentCookie,
  type ConsentChoice,
} from "@/lib/observability/consent";
import {
  ObservabilityContext,
  type ObservabilityContextValue,
  type ObservabilityUser,
} from "@/lib/observability/context";
import { FlagBootstrapContext } from "@/lib/observability/flag-context";
import { FLAGS, useFlag } from "@/lib/observability/flags";
import type { SupportContext } from "@/lib/observability/support";

interface SupportState {
  open: boolean;
  context: SupportContext;
}

/**
 * Mounted once in the locale layout. Owns the consent choice, starts the
 * vendor client when (and only when) consent is granted, identifies the
 * signed-in user, bootstraps server-evaluated flags, and hosts the consent
 * banner and the support panel so every entry point shares one instance.
 */
export function ObservabilityProvider({
  enabled,
  user,
  initialConsent,
  flags,
  children,
}: {
  enabled: boolean;
  user: ObservabilityUser | null;
  initialConsent: ConsentChoice | null;
  flags: FlagBootstrap;
  children: React.ReactNode;
}) {
  const [consent, setConsent] = useState(initialConsent);
  const [support, setSupport] = useState<SupportState>({
    open: false,
    context: { kind: "menu" },
  });
  const previousUserId = useRef<string | null>(user?.id ?? null);

  // Start the client on first render with a granted choice; identity
  // follows the current user and is reset once on sign-out.
  useEffect(() => {
    if (!enabled) return;
    setFlagBootstrap(flags);
    if (consent !== "granted") return;
    if (!startClient()) return;
    if (user) {
      identifyUser(user);
    } else if (previousUserId.current !== null) {
      resetIdentity();
    }
    previousUserId.current = user?.id ?? null;
  }, [enabled, consent, flags, user]);

  const grant = useCallback(() => {
    writeConsentCookie("granted");
    setConsent("granted");
  }, []);

  const revoke = useCallback(() => {
    writeConsentCookie("denied");
    stopClient();
    setConsent("denied");
  }, []);

  const openSupport = useCallback((context: SupportContext) => {
    setSupport({ open: true, context });
  }, []);
  const closeSupport = useCallback(() => {
    setSupport((current) => ({ ...current, open: false }));
  }, []);

  const value = useMemo<ObservabilityContextValue>(
    () => ({
      enabled,
      consent,
      grant,
      revoke,
      user,
      supportAvailable: false,
      openSupport,
    }),
    [enabled, consent, grant, revoke, user, openSupport],
  );

  return (
    <FlagBootstrapContext.Provider value={flags.featureFlags}>
      <SupportGate value={value}>
        {children}
        {enabled ? <ConsentBanner /> : null}
        {enabled && support.open ? (
          <SupportPanel context={support.context} onClose={closeSupport} />
        ) : null}
      </SupportGate>
    </FlagBootstrapContext.Provider>
  );
}

/** Resolves the support kill switch inside the flag context. */
function SupportGate({
  value,
  children,
}: {
  value: ObservabilityContextValue;
  children: React.ReactNode;
}) {
  const supportOn = useFlag(FLAGS.supportPanel, true);
  const resolved = useMemo(
    () => ({ ...value, supportAvailable: value.enabled && supportOn }),
    [value, supportOn],
  );
  return (
    <ObservabilityContext.Provider value={resolved}>
      {children}
    </ObservabilityContext.Provider>
  );
}
