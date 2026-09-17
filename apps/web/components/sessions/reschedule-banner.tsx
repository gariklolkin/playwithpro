"use client";

import type { RescheduleProposal } from "@playwithpro/shared";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useNow } from "@/lib/use-now";

/**
 * The session's open reschedule proposal, for both parties: every offered
 * time in the viewer's timezone, when the proposal expires, and the actions
 * that are theirs — the responder accepts one option or declines, the
 * proposer can only withdraw. Used on the sessions list and in the room.
 */
export function RescheduleBanner({
  sessionId,
  proposal,
  counterpartName,
  onChanged,
}: {
  sessionId: string;
  proposal: RescheduleProposal;
  counterpartName: string;
  /** The proposal was answered or withdrawn: reload the surrounding data. */
  onChanged: () => void;
}) {
  const t = useTranslations("sessions.reschedule");
  const format = useFormatter();
  const locale = useLocale();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function post(path: string, body?: object) {
    setBusy(true);
    setFailed(false);
    const response = await apiFetch(
      `/sessions/${sessionId}/reschedule/${path}`,
      { method: "POST", body: body ? JSON.stringify(body) : undefined },
    );
    setBusy(false);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    onChanged();
  }

  const when = (iso: string) =>
    now === null
      ? "…"
      : new Intl.DateTimeFormat(locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso));
  const expiresIn =
    now === null
      ? null
      : format.relativeTime(new Date(proposal.expiresAt), new Date(now));

  return (
    <div
      className="mt-3 rounded-lg border border-[#C9D9F2] bg-[#EAF2FD] p-3 text-[13px] text-[#2A5FC7]"
      data-testid="reschedule-banner"
    >
      <div className="font-medium">
        🗓️{" "}
        {proposal.mine
          ? t("titleMine", { name: counterpartName })
          : t("titleTheirs", { name: counterpartName })}
      </div>
      <ul className="mt-2 space-y-1.5">
        {proposal.options.map((option) => (
          <li
            key={option.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="font-medium text-text" suppressHydrationWarning>
              {when(option.startsAt)}
            </span>
            {!proposal.mine ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void post("accept", { optionId: option.id })}
              >
                {t("accept")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-[#2A5FC7]/80">
        {t("yourTime")}
        {expiresIn ? ` · ${t("expires", { relative: expiresIn })}` : ""}
        {` · ${t("keepsTime")}`}
      </p>
      <div className="mt-2">
        {proposal.mine ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void post("withdraw")}
          >
            {t("withdraw")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void post("decline")}
          >
            {t("decline")}
          </Button>
        )}
      </div>
      {failed ? <p className="mt-2 text-[#C4554D]">{t("error")}</p> : null}
    </div>
  );
}
