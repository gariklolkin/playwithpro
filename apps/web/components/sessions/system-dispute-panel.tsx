"use client";

import {
  COACH_RESPONSE_MAX_LENGTH,
  COACH_RESPONSE_MIN_LENGTH,
  type DisputeSummary,
  type SessionResponse,
} from "@playwithpro/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EvidenceLine } from "./attendance-evidence";

/**
 * An open dispute the system opened from attendance evidence. The player
 * sees the hold, when the refund lands (or that an admin decides) and can
 * still confirm — their confirmation always wins. The coach sees the
 * evidence, the deadline, and the single statement they may submit.
 */
export function SystemDisputePanel({
  session,
  dispute,
  isCoach,
  now,
  busy,
  failed,
  onConfirm,
  onRespond,
}: {
  session: SessionResponse;
  dispute: DisputeSummary;
  isCoach: boolean;
  now: number | null;
  busy: boolean;
  failed: boolean;
  onConfirm: () => void;
  onRespond: (statement: string) => void;
}) {
  const t = useTranslations("sessions.actions");
  const format = useFormatter();
  const [responding, setResponding] = useState(false);
  const [statement, setStatement] = useState("");
  const relative =
    dispute.responseDueAt !== null && now !== null
      ? format.relativeTime(new Date(dispute.responseDueAt), new Date(now))
      : null;
  const tooShort = statement.trim().length < COACH_RESPONSE_MIN_LENGTH;

  return (
    <div className="mt-3 rounded-lg border border-[#F1C7C4] bg-[#FBE4E4] p-3 text-[13px] text-[#C4554D]">
      <div className="font-medium">⚖️ {t("system.title")}</div>
      <EvidenceLine session={session} isCoach={isCoach} className="mt-1" />
      <p className="mt-1 text-[#9A6A66]">
        {isCoach
          ? relative
            ? t("system.coachDeadline", { relative })
            : dispute.coachRespondedAt
              ? t("system.responded")
              : t("system.coachAdmin")
          : relative
            ? t("system.refundIn", { relative })
            : t("system.adminDecides")}
      </p>

      {dispute.coachResponse ? (
        <blockquote
          className="mt-2 rounded-lg border border-[#F1C7C4] bg-bg px-3 py-2 text-text"
          data-ph-mask
        >
          <span className="block text-[12px] text-text-tertiary">
            {isCoach ? t("system.yourResponse") : t("system.coachResponse")}
          </span>
          {dispute.coachResponse}
        </blockquote>
      ) : null}

      {!isCoach ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[#9A6A66]">{t("system.confirmHint")}</span>
          <Button size="sm" disabled={busy} onClick={onConfirm}>
            ✓ {t("confirmCta")}
          </Button>
        </div>
      ) : null}

      {isCoach && !dispute.coachRespondedAt ? (
        responding ? (
          <form
            className="mt-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!tooShort) onRespond(statement.trim());
            }}
          >
            <textarea
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              placeholder={t("system.respondPlaceholder")}
              rows={3}
              maxLength={COACH_RESPONSE_MAX_LENGTH}
              data-ph-mask
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
            />
            {statement.length > 0 && tooShort ? (
              <p className="mt-1 text-[12px]">
                {t("system.respondTooShort", {
                  min: COACH_RESPONSE_MIN_LENGTH,
                })}
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Button size="sm" type="submit" disabled={busy || tooShort}>
                {t("system.respondSubmit")}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setResponding(false)}
              >
                {t("disputeAbort")}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            size="sm"
            className="mt-2"
            disabled={busy}
            onClick={() => setResponding(true)}
          >
            {t("system.respondCta")}
          </Button>
        )
      ) : null}

      {failed ? <p className="mt-2">{t("error")}</p> : null}
    </div>
  );
}
