"use client";

import {
  DisputeKind,
  DisputeOutcome,
  type AdminDisputeItem,
  type AdminDisputeListResponse,
} from "@playwithpro/shared";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useNow } from "@/lib/use-now";

const KINDS = [
  DisputeKind.PlayerReported,
  DisputeKind.CoachNoShow,
  DisputeKind.NoAttendance,
  DisputeKind.EvidenceGap,
] as const;

/** What the evidence adds up to, above the raw room entries. */
function AttendanceSummaryBlock({ item }: { item: AdminDisputeItem }) {
  const t = useTranslations("adminDisputes");
  const format = useFormatter();
  const summary = item.attendanceSummary;
  if (!summary) return null;
  const time = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(iso), { timeStyle: "short" })
      : t("summaryNever");
  return (
    <div
      className="mt-3 rounded-lg border border-border px-3 py-2 text-[13px] text-text"
      data-testid="attendance-summary"
    >
      <div className="text-[12px] font-semibold uppercase tracking-wide text-text-tertiary">
        {t("summaryTitle")}
      </div>
      <ul className="mt-1 space-y-0.5">
        <li>
          {t("summaryPlayer", { time: time(summary.playerFirstConnectedAt) })}
        </li>
        <li>
          {t("summaryCoach", { time: time(summary.coachFirstConnectedAt) })}
        </li>
        <li>
          {t("summaryOverlap", { minutes: summary.overlapMinutes })}
          {summary.partial ? ` · ${t("summaryPartial")}` : ""}
        </li>
      </ul>
    </div>
  );
}

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
          {" · "}
          {entry.connectedAt
            ? t("connectedAt", {
                time: format.dateTime(new Date(entry.connectedAt), {
                  timeStyle: "short",
                }),
              })
            : t("neverConnected")}
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
  const tActions = useTranslations("sessions.actions");
  const locale = useLocale();
  const format = useFormatter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<DisputeOutcome | null>(null);
  const [failed, setFailed] = useState(false);
  const now = useNow();
  const open = item.outcome === null;
  const system = item.kind !== DisputeKind.PlayerReported;

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
          </span>{" "}
          <span
            className={`rounded px-2 py-0.5 text-[12px] font-medium ${
              system
                ? "bg-[#FBE4E4] text-[#C4554D]"
                : "bg-bg-secondary text-text-secondary"
            }`}
          >
            {t(`kind.${item.kind}`)}
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
      {item.kind === DisputeKind.CoachNoShow ||
      item.coachPreviousNoShows > 0 ? (
        <p className="mt-1 text-[13px] text-text-secondary">
          {t("previousNoShows", { count: item.coachPreviousNoShows })}
        </p>
      ) : null}
      {!system ? (
        <blockquote className="mt-3 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text">
          {item.reasonCategory ? (
            <span className="block text-[12px] font-medium text-text-secondary">
              {tActions(`category.${item.reasonCategory}`)}
            </span>
          ) : null}
          {item.reason ? `“${item.reason}”` : t("noReason")}
        </blockquote>
      ) : null}
      {open && item.responseDueAt && now !== null ? (
        <p className="mt-3 text-[13px] font-medium text-[#C4554D]">
          ⏳{" "}
          {t("autoResolveAt", {
            relative: format.relativeTime(
              new Date(item.responseDueAt),
              new Date(now),
            ),
          })}
        </p>
      ) : null}
      {item.coachResponse && item.coachRespondedAt ? (
        <blockquote className="mt-3 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text">
          <span className="block text-[12px] font-medium text-text-secondary">
            {t("coachResponse", {
              time: format.dateTime(new Date(item.coachRespondedAt), {
                dateStyle: "short",
                timeStyle: "short",
              }),
            })}
          </span>
          “{item.coachResponse}”
        </blockquote>
      ) : null}
      <AttendanceSummaryBlock item={item} />
      {item.attendanceSummary ? (
        <div className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-text-tertiary">
          {t("rawTitle")}
        </div>
      ) : null}
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
          {item.resolvedVia ? (
            <span className="ml-2 text-[13px]">
              {t(`resolvedVia.${item.resolvedVia}`)}
            </span>
          ) : null}
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
  const [kind, setKind] = useState<DisputeKind | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  async function filterBy(next: DisputeKind | null) {
    setKind(next);
    setLoadFailed(false);
    const response = await apiFetch(
      next ? `/admin/disputes?kind=${next}` : "/admin/disputes",
    );
    if (!response.ok) {
      setLoadFailed(true);
      return;
    }
    const list = (await response.json()) as AdminDisputeListResponse;
    setOpen(list.open);
    setResolved(list.resolved);
  }

  function handleResolved(item: AdminDisputeItem) {
    setOpen((current) => current.filter((d) => d.id !== item.id));
    setResolved((current) => [item, ...current]);
  }

  const chip = (active: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1 text-[13px] ${
      active
        ? "border-border-strong bg-bg-secondary font-medium text-text"
        : "border-border text-text-secondary hover:bg-bg-secondary"
    }`;

  return (
    <div className="mt-6">
      <div
        role="group"
        aria-label={t("filterLabel")}
        className="mb-4 flex flex-wrap gap-2"
      >
        <button
          type="button"
          aria-pressed={kind === null}
          className={chip(kind === null)}
          onClick={() => void filterBy(null)}
        >
          {t("filterAll")}
        </button>
        {KINDS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            className={chip(kind === value)}
            onClick={() => void filterBy(value)}
          >
            {t(`kind.${value}`)}
          </button>
        ))}
      </div>
      {loadFailed ? (
        <p className="mb-4 text-[13px] text-[#C4554D]">{t("loadError")}</p>
      ) : null}
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
