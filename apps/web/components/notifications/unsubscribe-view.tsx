"use client";

import type { UnsubscribeResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";

type State =
  | { kind: "working" }
  | { kind: "done"; category: UnsubscribeResponse["category"] }
  | { kind: "invalid" };

/**
 * One-click unsubscribe landing: posts the signed token from the email
 * link (no sign-in needed) and confirms which category was turned off.
 */
export function UnsubscribeView({ token }: { token: string | null }) {
  const t = useTranslations("unsubscribe");
  const [state, setState] = useState<State>(
    token ? { kind: "working" } : { kind: "invalid" },
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void apiFetch("/notifications/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "invalid" });
          return;
        }
        const body = (await response.json()) as UnsubscribeResponse;
        setState({ kind: "done", category: body.category });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "invalid" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="mx-auto w-full max-w-[520px] flex-1 px-5 pb-24 pt-16 text-center sm:px-8">
      <div className="text-4xl">
        {state.kind === "done" ? "✅" : state.kind === "invalid" ? "⚠️" : "⏳"}
      </div>
      <h1 className="mt-3 text-xl font-bold text-text">{t("title")}</h1>
      <p
        className="mt-2 text-sm text-text-secondary"
        data-testid="unsubscribe-status"
      >
        {state.kind === "working"
          ? t("working")
          : state.kind === "done"
            ? t("done", { category: t(`categories.${state.category}`) })
            : t("invalid")}
      </p>
      <Link
        href="/dashboard?settings=notifications"
        className="mt-6 inline-block rounded-lg border border-border-strong px-3.5 py-[9px] text-sm font-medium text-text no-underline hover:bg-bg-hover"
      >
        {t("settingsLink")}
      </Link>
    </main>
  );
}
