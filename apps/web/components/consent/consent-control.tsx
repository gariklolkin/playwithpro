"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useObservability } from "@/lib/observability/context";

/** The privacy page's "change your choice" block. */
export function ConsentControl() {
  const t = useTranslations("privacy.control");
  const { enabled, consent, grant, revoke } = useObservability();

  if (!enabled) {
    return <p className="text-sm text-text-secondary">{t("disabled")}</p>;
  }

  const status =
    consent === "granted"
      ? t("statusGranted")
      : consent === "denied"
        ? t("statusDenied")
        : t("statusNone");

  return (
    <div className="rounded-card border border-border p-4">
      <p className="text-sm text-text">{status}</p>
      <div className="mt-3 flex gap-2">
        {consent !== "granted" ? (
          <Button size="sm" onClick={grant}>
            {t("accept")}
          </Button>
        ) : null}
        {consent !== "denied" ? (
          <Button size="sm" variant="ghost" onClick={revoke}>
            {t("decline")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
