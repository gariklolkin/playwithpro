"use client";

import {
  DisputeOutcome,
  type AdminDisputeItem,
  type AdminDisputeListResponse,
} from "@playwithpro/shared";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";

function AttendanceEvidence({ item }: { item: AdminDisputeItem }) {
  const t = useTranslations("adminDisputes");
  const format = useFormatter();
  if (item.attendance.length === 0) {
    return (
      <p className="mt-2 text-[13px] text-text-tertiary">{t("noAttendance")}</p>
    );
  }
  return (
    <ul className="mt-2 space-y-1 text-[13px] text-text-secondary">
      {item.attendance.map((entry, index) => (
        <li key={`${entry.userId}-${index}`}>
          🕐 {entry.displayName}:{" "}
          {format.dateTime(new Date(entry.joinedAt), {
            dateStyle: "short",
            timeStyle: "short",
          })}
          {entry.leftAt
            ? ` → ${format.dateTime(new Date(entry.leftAt), { timeStyle: "short" })}`
            : ` (${t("noLeaveTime")})`}
        </li>
      ))}
    </ul>
  );
}

function DisputeCard({
  item,
  onResolved,
}: {
  item: AdminDisputeItem;
  onResolved: (resolved: AdminDisputeItem) => void;
}) {
  const t = useTranslations("adminDisputes");
  const tCatalog = useTranslations("catalog");
  const locale = useLocale();
  const format = useFormatter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<DisputeOutcome | null>(null);
  const [failed, setFailed] = useState(false);
  const open = item.outcome === null;

  async function resolve(outcome: DisputeOutcome) {
    setBusy(outcome);
    setFailed(false);
    const response = await apiFetch(`/admin/disputes/${item.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        outcome,
        note: note.trim() === "" ? undefined : note.trim(),
      }),
    });
    setBusy(null);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    onResolved((await response.json()) as AdminDisputeItem);
  }

  return (
    <article className="mb-4 rounded-card bg-bg p-6 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold text-text">
            {item.player.displayName}
          </span>{" "}
          <span className="text-sm text-text-secondary">vs</span>{" "}
          <span className="font-semibold text-text">
            {item.coach.displayName}
          </span>{" "}
          <span className="rounded bg-bg-secondary px-2 py-0.5 text-[12px] text-text-secondary">
            {tCatalog(`service.${item.serviceType}`)}
          </span>
        </div>
        <span className="text-sm font-medium text-text">
          {formatMoney(item.amountMinor, item.currency, locale)}
        </span>
      </header>
      <p className="mt-1 text-[13px] text-text-tertiary">
        {format.dateTime(new Date(item.startsAt), {
          dateStyle: "medium",
          timeStyle: "short",
        })}{" "}
        · {t("openedAt")}{" "}
        {format.dateTime(new Date(item.openedAt), {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </p>
      <blockquote className="mt-3 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text">
        “{item.reason}”
      </blockquote>
      <AttendanceEvidence item={item} />

      {open ? (
        <div className="mt-4">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("notePlaceholder")}
            rows={2}
            maxLength={2000}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => void resolve(DisputeOutcome.Release)}
            >
              💸{" "}
              {t("releaseCta", {
                fee: formatMoney(item.feeMinor, item.currency, locale),
              })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void resolve(DisputeOutcome.Refund)}
            >
              ↩️ {t("refundCta")}
            </Button>
          </div>
          {failed ? (
            <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 text-sm text-text-secondary">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              item.outcome === DisputeOutcome.Refund
                ? "bg-bg-secondary text-text-secondary"
                : "bg-[#DBEDDB] text-[#1C7A46]"
            }`}
          >
            {item.outcome === DisputeOutcome.Refund
              ? t("outcomeRefund")
              : t("outcomeRelease")}
          </span>
          {item.adminNote ? (
            <p className="mt-2 text-[13px]">{item.adminNote}</p>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function AdminDisputes({
  initial,
}: {
  initial: AdminDisputeListResponse;
}) {
  const t = useTranslations("adminDisputes");
  const [open, setOpen] = useState(initial.open);
  const [resolved, setResolved] = useState(initial.resolved);

  function handleResolved(item: AdminDisputeItem) {
    setOpen((current) => current.filter((d) => d.id !== item.id));
    setResolved((current) => [item, ...current]);
  }

  return (
    <div className="mt-6">
      {open.length === 0 ? (
        <div className="rounded-card border border-border p-10 text-center">
          <div className="text-3xl">⚖️</div>
          <p className="mt-2 text-sm text-text-secondary">{t("empty")}</p>
        </div>
      ) : (
        open.map((item) => (
          <DisputeCard key={item.id} item={item} onResolved={handleResolved} />
        ))
      )}

      {resolved.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
            {t("resolvedTitle")}
          </h2>
          {resolved.map((item) => (
            <DisputeCard
              key={item.id}
              item={item}
              onResolved={handleResolved}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
