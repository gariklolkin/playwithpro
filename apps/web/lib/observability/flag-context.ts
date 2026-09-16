"use client";

import { createContext } from "react";

/** Server-evaluated flags for the current request, bootstrapped into the client. */
export const FlagBootstrapContext = createContext<
  Record<string, boolean | string> | undefined
>(undefined);
