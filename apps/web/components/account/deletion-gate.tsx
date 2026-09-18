"use client";

import type { DeletionStatusResponse } from "@playwithpro/shared";
import { useFormatter, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ExportCard } from "@/components/account/export-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { resetIdentity } from "@/lib/observability/client";

/** Legal pages stay readable (the privacy policy explains the deletion). */
function isExempt(pathname: string): boolean {
  return /^(\/[a-z]{2})?\/legal(\/|$)/.test(pathname);
}

/**
 * The grace-period screen: while a deletion is scheduled the signed-in user
 * sees only the date and the two things still possible — cancelling the
 * deletion and downloading their data (plus signing out).
 */
export function DeletionGate({
  scheduledFor,
}: {
  scheduledFor: string | null;
}) {
  const t = useTranslations("account.gate");
  const format = useFormatter();
  const pathname = usePathname();
  const router = useRouter();
  const [postponed, setPostponed] = useState(false);
  const [byAdmin, setByAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!scheduledFor) return;
    let active = true;
    void apiFetch("/users/me/deletion").then(async (response) => {
      if (active && response.ok) {
        const status = (await response.json()) as DeletionStatusResponse;
        setPostponed(status.postponed);
        setByAdmin(status.initiatedBy === "admin");
      }
    });
    return () => {
      active = false;
    };
  }, [scheduledFor]);

  if (!scheduledFor || isExempt(pathname)) return null;

  async function cancel() {
    setBusy(true);
    setFailed(false);
    const response = await apiFetch("/users/me/deletion", { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    router.refresh();
  }

  async function signOut() {
    await apiFetch("/auth/logout", { method: "POST" });
    resetIdentity();
    router.push("/");
    router.refresh();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deletion-gate-title"
      data-testid="deletion-gate"
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
    >
      <div className="w-full max-w-[520px] rounded-card bg-bg p-6 shadow-card">
        <h2
          id="deletion-gate-title"
          className="text-[20px] font-bold text-text"
        >
          🗑️ {t("title")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t("body", {
            date: format.dateTime(new Date(scheduledFor), {
              dateStyle: "long",
              timeStyle: "short",
            }),
          })}
        </p>
        {postponed ? (
          <p className="mt-2 text-[13px] text-text-tertiary">
            {t("postponed")}
          </p>
        ) : null}
        {byAdmin ? (
          <p
            className="mt-4 text-sm text-text-secondary"
            data-testid="deletion-by-admin"
          >
            {t("byAdmin")}
          </p>
        ) : (
          <Button
            size="full"
            className="mt-4"
            disabled={busy}
            onClick={() => void cancel()}
          >
            {busy ? t("cancelling") : t("cancel")}
          </Button>
        )}
        {failed ? (
          <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
        ) : null}
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-semibold text-text">
            {t("download")}
          </h3>
          <ExportCard compact />
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-5 cursor-pointer text-[13px] text-text-secondary underline-offset-2 hover:underline"
        >
          {t("signOut")}
        </button>
      </div>
    </div>
  );
}
