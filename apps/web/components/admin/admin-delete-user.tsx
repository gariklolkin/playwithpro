"use client";

import {
  ACCOUNT_DELETION_REASON_MAX_LENGTH,
  ACCOUNT_ERROR_DELETION_BLOCKED,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";

/**
 * Admin-initiated deletion on the user detail: a required reason (kept in
 * the request log) and the grace — the platform default or immediately.
 */
export function AdminDeleteUser({
  userId,
  graceDays,
}: {
  userId: string;
  graceDays: number;
}) {
  const t = useTranslations("account.admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<"blocked" | "error" | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const response = await apiFetch(`/admin/users/${userId}/deletion`, {
      method: "POST",
      body: JSON.stringify({
        reason: reason.trim(),
        ...(immediate ? { graceDays: 0 } : {}),
      }),
    });
    setBusy(false);
    if (response.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
    };
    setFailure(
      body.code === ACCOUNT_ERROR_DELETION_BLOCKED ? "blocked" : "error",
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        🗑️ {t("deleteCta")}
      </Button>
    );
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="w-full max-w-[360px] rounded-card border border-border bg-bg p-4 text-left"
    >
      <h3 className="text-sm font-semibold text-text">{t("deleteTitle")}</h3>
      <Label htmlFor="admin-delete-reason" className="mt-3">
        {t("reason")}
      </Label>
      <textarea
        id="admin-delete-reason"
        required
        maxLength={ACCOUNT_DELETION_REASON_MAX_LENGTH}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="mb-3 min-h-[72px] w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
      />
      <fieldset className="mb-3 text-sm text-text">
        <legend className="mb-1 text-[13px] text-text-secondary">
          {t("grace")}
        </legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="admin-delete-grace"
            checked={!immediate}
            onChange={() => setImmediate(false)}
          />
          {t("graceDefault", { days: graceDays })}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="admin-delete-grace"
            checked={immediate}
            onChange={() => setImmediate(true)}
          />
          {t("graceNow")}
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || !reason.trim()}>
          {busy ? t("submitting") : t("submit")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          {t("cancel")}
        </Button>
      </div>
      {failure ? (
        <p className="mt-2 text-[13px] text-[#C4554D]">
          {failure === "blocked" ? t("blocked") : t("error")}
        </p>
      ) : null}
    </form>
  );
}
