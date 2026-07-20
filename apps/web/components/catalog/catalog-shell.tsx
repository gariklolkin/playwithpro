"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  CatalogFilters,
  type CatalogFilterValues,
  type NavigateMode,
} from "./catalog-filters";

/**
 * Client frame around the server-rendered results: owns the filter-driven
 * navigation transition so the old list stays visible (dimmed) while the
 * next page streams in, instead of a blocking route change.
 */
export function CatalogShell({
  initial,
  children,
}: {
  initial: CatalogFilterValues;
  children: React.ReactNode;
}) {
  const t = useTranslations("catalog");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function navigate(query: string, mode: NavigateMode) {
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      // Debounced intermediate price values replace instead of pushing so
      // the browser history doesn't collect one entry per keystroke pause.
      if (mode === "replace") {
        router.replace(href);
      } else {
        router.push(href);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[230px_1fr]">
      <aside className="md:border-r md:border-border md:pr-6">
        <h2 className="mb-3 text-sm font-semibold text-text">
          {t("filters.title")}
        </h2>
        <CatalogFilters initial={initial} onNavigate={navigate} />
      </aside>

      <section
        aria-busy={isPending}
        className={`transition-opacity duration-200 ${
          isPending ? "pointer-events-none opacity-50" : "opacity-100"
        }`}
      >
        {children}
      </section>
    </div>
  );
}
