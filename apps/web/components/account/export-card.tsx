"use client";

import {
  AccountDataRequestStatus,
  type ExportStatusResponse,
} from "@playwithpro/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

/**
 * "Download my data": requests the export (one per cooldown), shows its
 * state and hands out the short-lived link the API signs on every read.
 * Also used on the deletion grace screen.
 */
export function ExportCard({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("account.export");
  const format = useFormatter();
  const [status, setStatus] = useState<ExportStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void apiFetch("/users/me/export").then(async (response) => {
      if (active && response.ok) {
        setStatus((await response.json()) as ExportStatusResponse);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function request() {
    setBusy(true);
    setFailed(false);
    const response = await apiFetch("/users/me/export", { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    setStatus((await response.json()) as ExportStatusResponse);
  }

  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const pending =
    status?.status === AccountDataRequestStatus.Scheduled ||
    status?.status === AccountDataRequestStatus.Running;

  return (
    <div data-testid="export-card">
      {compact ? null : (
        <p className="mb-3 text-sm text-text-secondary">{t("intro")}</p>
      )}
      {status?.downloadUrl && status.expiresAt ? (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <a
            href={status.downloadUrl}
            className="rounded-lg bg-text px-3.5 py-[9px] text-sm font-medium text-white no-underline hover:bg-black"
          >
            ⬇️ {t("download")}
          </a>
          <span className="text-[13px] text-text-secondary">
            {t("ready", { date: date(status.expiresAt) })}
          </span>
        </div>
      ) : null}
      {pending ? (
        <p className="mb-3 text-[13px] text-text-secondary">{t("building")}</p>
      ) : null}
      {status?.status === AccountDataRequestStatus.Failed ? (
        <p className="mb-3 text-[13px] text-text-secondary">{t("failed")}</p>
      ) : null}
      {status?.nextAllowedAt ? (
        <p className="text-[13px] text-text-tertiary">
          {t("nextAllowed", { date: date(status.nextAllowedAt) })}
        </p>
      ) : (
        <Button
          variant={status?.downloadUrl ? "ghost" : "primary"}
          disabled={busy || status === null}
          onClick={() => void request()}
        >
          {busy ? t("requesting") : t("request")}
        </Button>
      )}
      {failed ? (
        <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
      ) : null}
    </div>
  );
}
