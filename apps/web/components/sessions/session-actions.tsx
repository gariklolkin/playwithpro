"use client";

import {
  DisputeOutcome,
  DisputeStatus,
  PaymentStatus,
  SessionStatus,
  type SessionResponse,
} from "@playwithpro/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useNow } from "@/lib/use-now";

/**
 * Post-payment lifecycle controls of one session card: confirm /
 * report-a-problem while awaiting confirmation, pre-start cancellation of a
 * paid session, and the dispute/payout state once the money has moved.
 */
export function SessionActions({
  session,
  isCoach,
}: {
  session: SessionResponse;
  isCoach: boolean;
}) {
  const t = useTranslations("sessions.actions");
  const format = useFormatter();
  const router = useRouter();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");

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
    router.refresh();
  }

  const awaiting = session.status === SessionStatus.AwaitingConfirmation;
  const ownConfirmedAt = isCoach
    ? session.coachConfirmedAt
    : session.playerConfirmedAt;
  const cancellable =
    session.status === SessionStatus.PaidEscrow &&
    now !== null &&
    new Date(session.startsAt).getTime() > now;

  const settledChip =
    session.escrow === PaymentStatus.Released ? (
      <span className="rounded bg-[#DBEDDB] px-2 py-0.5 text-xs font-medium text-[#1C7A46]">
        💸 {t("paidOut")}
      </span>
    ) : session.escrow === PaymentStatus.Refunded ? (
      <span className="rounded bg-bg-secondary px-2 py-0.5 text-xs font-medium text-text-secondary">
        ↩️ {t("refunded")}
      </span>
    ) : null;

  if (session.dispute && session.dispute.status === DisputeStatus.Open) {
    return (
      <div className="mt-3 rounded-lg border border-[#F1C7C4] bg-[#FBE4E4] p-3 text-[13px] text-[#C4554D]">
        <div className="font-medium">⚖️ {t("disputeOpenTitle")}</div>
        <p className="mt-1">{session.dispute.reason}</p>
        <p className="mt-1 text-[#9A6A66]">{t("disputeOpenHint")}</p>
      </div>
    );
  }

  if (session.dispute && session.dispute.status === DisputeStatus.Resolved) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
        <span>
          ⚖️{" "}
          {session.dispute.outcome === DisputeOutcome.Refund
            ? t("resolvedRefund")
            : t("resolvedRelease")}
        </span>
        {settledChip}
      </div>
    );
  }

  if (awaiting) {
    const autoConfirmIn =
      session.autoConfirmAt !== null && now !== null
        ? format.relativeTime(new Date(session.autoConfirmAt), new Date(now))
        : null;
    return (
      <div className="mt-3 rounded-lg border border-[#EAD8A3] bg-[#FDF7E7] p-3">
        <div className="text-[13px] font-medium text-[#8A6C1B]">
          {isCoach ? t("bannerTitleCoach") : t("bannerTitlePlayer")}
        </div>
        {autoConfirmIn ? (
          <p className="mt-0.5 text-[13px] text-[#8A6C1B]/80">
            {t("autoConfirm", { relative: autoConfirmIn })}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ownConfirmedAt ? (
            <span className="text-[13px] font-medium text-[#1C7A46]">
              ✓ {t("youConfirmed")}
            </span>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void post(`/sessions/${session.id}/confirm`)}
            >
              ✓ {t("confirmCta")}
            </Button>
          )}
          {!isCoach && !disputeOpen ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setDisputeOpen(true)}
            >
              {t("reportCta")}
            </Button>
          ) : null}
        </div>
        {disputeOpen ? (
          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim().length === 0) {
                return;
              }
              void post(`/sessions/${session.id}/dispute`, {
                reason: reason.trim(),
              });
            }}
          >
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("disputePlaceholder")}
              rows={3}
              maxLength={2000}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                type="submit"
                disabled={busy || reason.trim().length === 0}
              >
                {t("disputeSubmit")}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setDisputeOpen(false)}
              >
                {t("disputeAbort")}
              </Button>
            </div>
          </form>
        ) : null}
        {failed ? (
          <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
        ) : null}
      </div>
    );
  }

  if (cancellable) {
    return (
      <div className="mt-3">
        {confirmingCancel ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-text-secondary">{t("cancelWarning")}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void post(`/sessions/${session.id}/cancel`)}
            >
              {t("cancelConfirm")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmingCancel(false)}
            >
              {t("cancelKeep")}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="cursor-pointer text-[13px] text-text-tertiary underline-offset-2 hover:text-[#C4554D] hover:underline"
            onClick={() => setConfirmingCancel(true)}
          >
            {t("cancelCta")}
          </button>
        )}
        {failed ? (
          <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
        ) : null}
      </div>
    );
  }

  if (settledChip) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {settledChip}
      </div>
    );
  }

  return null;
}
