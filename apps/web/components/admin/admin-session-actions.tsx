"use client";

import {
  CANCELLATION_REASON_MAX_LENGTH,
  CancellationTier,
  PaymentStatus,
  SessionStatus,
  type AdminPaymentItem,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useNow } from "@/lib/use-now";

/**
 * The two ways money moves from the admin console, on the ledger row of a
 * held payment: a force-majeure cancellation of a paid session that has not
 * started (full refund, required reason) and the waiver of a late
 * cancellation's fee while it has not settled.
 */
export function AdminSessionActions({
  payment,
}: {
  payment: AdminPaymentItem;
}) {
  const t = useTranslations("adminConsole.sessionActions");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const now = useNow();

  if (payment.status !== PaymentStatus.Held || now === null) return null;
  const canCancel =
    payment.sessionStatus === SessionStatus.PaidEscrow &&
    new Date(payment.sessionStartsAt).getTime() > now;
  const canWaive =
    payment.cancellation !== null &&
    !payment.cancellation.waived &&
    payment.cancellation.tier !== CancellationTier.Free;
  if (!canCancel && !canWaive) return null;

  async function post(path: string, body?: object) {
    setBusy(true);
    setFailed(false);
    const response = await apiFetch(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-1.5">
      {canWaive ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void post(`/admin/sessions/${payment.sessionId}/cancellation/waive`)
          }
        >
          ↩️ {t("waiveCta")}
        </Button>
      ) : open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim() === "") return;
            void post(`/admin/sessions/${payment.sessionId}/cancel`, {
              reason: reason.trim(),
            });
          }}
        >
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
            aria-label={t("reasonLabel")}
            rows={2}
            maxLength={CANCELLATION_REASON_MAX_LENGTH}
            className="w-full min-w-[220px] rounded-lg border border-border bg-bg px-2 py-1.5 text-[13px] text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
          />
          <p className="mt-1 text-[12px] text-text-tertiary">
            {t("cancelHint")}
          </p>
          <div className="mt-1.5 flex gap-2">
            <Button
              size="sm"
              type="submit"
              disabled={busy || reason.trim() === ""}
            >
              {t("cancelConfirm")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t("back")}
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="cursor-pointer text-[12px] text-text-tertiary underline-offset-2 hover:text-[#C4554D] hover:underline"
          onClick={() => setOpen(true)}
        >
          {t("cancelCta")}
        </button>
      )}
      {failed ? (
        <p className="mt-1 text-[12px] text-[#C4554D]">{t("error")}</p>
      ) : null}
    </div>
  );
}
