"use client";

import {
  AccountDataRequestStatus,
  type AdminAccountRequestItem,
} from "@playwithpro/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";

const STATUS_CLASSES: Record<AccountDataRequestStatus, string> = {
  [AccountDataRequestStatus.Scheduled]: "bg-[#FDECC8] text-[#402C1B]",
  [AccountDataRequestStatus.Running]: "bg-[#D3E5EF] text-[#183347]",
  [AccountDataRequestStatus.Postponed]: "bg-[#FDECC8] text-[#402C1B]",
  [AccountDataRequestStatus.Completed]: "bg-[#DBEDDB] text-[#1C3829]",
  [AccountDataRequestStatus.Cancelled]: "bg-bg-secondary text-text-secondary",
  [AccountDataRequestStatus.Failed]: "bg-[#FFE2DD] text-[#5D1715]",
};

/** The read-only request log with a retry on failed rows. */
export function AccountRequestsLog({
  items: initial,
}: {
  items: AdminAccountRequestItem[];
}) {
  const t = useTranslations("account.admin.log");
  const format = useFormatter();
  const [items, setItems] = useState(initial);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [failedRetry, setFailedRetry] = useState<string | null>(null);

  async function retry(id: string) {
    setRetrying(id);
    setFailedRetry(null);
    const response = await apiFetch(`/admin/account-requests/${id}/retry`, {
      method: "POST",
    });
    setRetrying(null);
    if (!response.ok) {
      setFailedRetry(id);
      return;
    }
    const updated = (await response.json()) as AdminAccountRequestItem;
    setItems((rows) => rows.map((row) => (row.id === id ? updated : row)));
    if (updated.status === AccountDataRequestStatus.Failed) setFailedRetry(id);
  }

  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" });

  if (items.length === 0) {
    return <p className="mt-4 text-sm text-text-secondary">{t("empty")}</p>;
  }
  return (
    <ul className="mt-4 space-y-3" data-testid="account-requests">
      {items.map((item) => {
        const failedSteps = Object.entries(item.steps).filter(
          ([, step]) => step.status !== "done",
        );
        return (
          <li
            key={item.id}
            className="rounded-card border border-border bg-bg p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-text">{t(`kinds.${item.kind}`)}</strong>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[item.status]}`}
                >
                  {t(`statuses.${item.status}`)}
                </span>
                <Link
                  href={`/dashboard/admin/users/${item.userId}`}
                  className="font-mono text-[12px] text-text-secondary hover:underline"
                >
                  {item.userId.slice(0, 8)}
                </Link>
                <span className="text-text-tertiary">
                  {t("initiator")}: {t(`initiators.${item.initiatedBy}`)}
                </span>
              </div>
              <span className="text-[13px] text-text-tertiary">
                {t("requested")}: {date(item.requestedAt)}
                {item.status === AccountDataRequestStatus.Scheduled ||
                item.status === AccountDataRequestStatus.Postponed
                  ? ` · ${t("scheduledFor", { date: date(item.scheduledFor) })}`
                  : ""}
              </span>
            </div>
            {item.reason ? (
              <p className="mt-2 text-[13px] text-text-secondary">
                “{item.reason}”
              </p>
            ) : null}
            {failedSteps.length > 0 || item.lastError ? (
              <ul className="mt-2 space-y-0.5 text-[12.5px] text-text-secondary">
                {failedSteps.map(([name, step]) => (
                  <li key={name}>
                    <span className="font-mono">{name}</span>: {step.status}
                    {step.error ? ` — ${step.error}` : ""}
                  </li>
                ))}
                {item.lastError ? <li>{item.lastError}</li> : null}
              </ul>
            ) : null}
            {item.status === AccountDataRequestStatus.Failed ? (
              <div className="mt-3 flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={retrying === item.id}
                  onClick={() => void retry(item.id)}
                >
                  {retrying === item.id ? t("retrying") : t("retry")}
                </Button>
                {failedRetry === item.id ? (
                  <span className="text-[13px] text-[#C4554D]">
                    {t("retryError")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
