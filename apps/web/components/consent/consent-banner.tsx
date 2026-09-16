"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useObservability } from "@/lib/observability/context";

/**
 * One line, two buttons, never blocks content. Shown until a choice for
 * the current consent version exists; hidden entirely without a key.
 */
export function ConsentBanner() {
  const t = useTranslations("consent");
  const { enabled, consent, grant, revoke } = useObservability();
  if (!enabled || consent !== null) return null;

  return (
    <div
      role="region"
      aria-label={t("title")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg px-4 py-3 shadow-card sm:px-8"
    >
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-[13px] leading-snug text-text-secondary">
          🍪 {t("body")}{" "}
          <Link
            href="/privacy"
            className="text-accent no-underline hover:underline"
          >
            {t("privacyLink")}
          </Link>
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={revoke}>
            {t("decline")}
          </Button>
          <Button size="sm" onClick={grant}>
            {t("accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
