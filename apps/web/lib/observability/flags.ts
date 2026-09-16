"use client";

import { useContext, useEffect, useState } from "react";
import { flagValue, onFlagsChanged } from "./client";
import { FlagBootstrapContext } from "./flag-context";

/** Flags are named after the OpenSpec change they guard (see project.md). */
export const FLAGS = {
  /** Kill switch for the in-app support panel entry points. */
  supportPanel: "add-product-observability-support-panel",
} as const;

export type FlagName = (typeof FLAGS)[keyof typeof FLAGS];

/**
 * Boolean flag hook. The value comes from the server-evaluated bootstrap
 * (no flicker, no per-component request); once the client is started it
 * follows background refreshes. Without a token every flag is its default.
 */
export function useFlag(name: FlagName, fallback: boolean): boolean {
  const bootstrap = useContext(FlagBootstrapContext);
  const [live, setLive] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const read = () => {
      const value = flagValue(name);
      setLive(
        value === undefined
          ? undefined
          : typeof value === "boolean"
            ? value
            : value !== "false",
      );
    };
    read();
    return onFlagsChanged(read);
  }, [name]);

  if (live !== undefined) return live;
  const bootstrapped = bootstrap?.[name];
  if (typeof bootstrapped === "boolean") return bootstrapped;
  if (typeof bootstrapped === "string") return bootstrapped !== "false";
  return fallback;
}
