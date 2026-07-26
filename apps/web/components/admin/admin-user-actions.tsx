"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";

/** Suspend / unsuspend controls on the admin user detail page. */
export function AdminUserActions({
  userId,
  suspendedAt,
}: {
  userId: string;
  suspendedAt: string | null;
}) {
  const t = useTranslations("adminConsole.users");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const suspended = suspendedAt !== null;

  async function submit() {
    setBusy(true);
    setFailed(false);
    const action = suspended ? "unsuspend" : "suspend";
    const response = await apiFetch(`/admin/users/${userId}/${action}`, {
      method: "POST",
    });
    setBusy(false);
    setConfirming(false);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-secondary">
            {suspended ? t("confirmUnsuspend") : t("confirmSuspend")}
          </span>
          <Button size="sm" disabled={busy} onClick={() => void submit()}>
            {suspended ? t("unsuspendCta") : t("suspendCta")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant={suspended ? "primary" : "ghost"}
          onClick={() => setConfirming(true)}
        >
          {suspended ? `✅ ${t("unsuspendCta")}` : `⛔ ${t("suspendCta")}`}
        </Button>
      )}
      {failed ? (
        <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
      ) : null}
    </div>
  );
}
