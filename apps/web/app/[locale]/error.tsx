"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { SupportButton } from "@/components/support/support-button";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { errorIdOf, reportError } from "@/lib/observability/errors";

/**
 * Route error boundary inside the locale layout: reports the error (with
 * the locale and a reference id) and offers retry, home and support with
 * the error attached.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const locale = useLocale();
  const errorId = useMemo(() => errorIdOf(error), [error]);

  useEffect(() => {
    reportError(error, { source: "route-boundary", locale, errorId });
  }, [error, locale, errorId]);

  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5 pb-24 pt-16 text-center sm:px-8">
      <div className="text-4xl">⚠️</div>
      <h1 className="mt-3 text-xl font-bold text-text">{t("title")}</h1>
      <p className="mt-1 text-sm text-text-secondary">{t("hint")}</p>
      <p className="mt-3 text-[12px] text-text-tertiary">
        {t("reference", { id: errorId })}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>{t("retry")}</Button>
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-border-strong px-3.5 py-[9px] text-sm font-medium text-text no-underline hover:bg-bg-hover"
        >
          {t("home")}
        </Link>
        <SupportButton variant="ghost" context={{ kind: "error", errorId }} />
      </div>
    </main>
  );
}
