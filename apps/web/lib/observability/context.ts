"use client";

import { createContext, useContext } from "react";
import type { IdentifiedUser } from "./client";
import type { ConsentChoice } from "./consent";
import type { SupportContext } from "./support";

export interface ObservabilityUser extends IdentifiedUser {
  displayName: string;
  email: string;
}

export interface ObservabilityContextValue {
  /** A client key is configured for this deployment. */
  enabled: boolean;
  consent: ConsentChoice | null;
  grant: () => void;
  revoke: () => void;
  user: ObservabilityUser | null;
  /** The support panel is enabled (key + flag) and can be opened. */
  supportAvailable: boolean;
  openSupport: (context: SupportContext) => void;
}

const noop = () => {};

export const DEFAULT_OBSERVABILITY: ObservabilityContextValue = {
  enabled: false,
  consent: null,
  grant: noop,
  revoke: noop,
  user: null,
  supportAvailable: false,
  openSupport: noop,
};

export const ObservabilityContext = createContext<ObservabilityContextValue>(
  DEFAULT_OBSERVABILITY,
);

export function useObservability(): ObservabilityContextValue {
  return useContext(ObservabilityContext);
}

/** Entry points: render the button only when `available`. */
export function useSupport(): {
  available: boolean;
  open: (context: SupportContext) => void;
} {
  const { supportAvailable, openSupport } = useContext(ObservabilityContext);
  return { available: supportAvailable, open: openSupport };
}
