import {
  CATALOG_PAGE_SIZE,
  Locale,
  type CatalogResponse,
} from "@playwithpro/shared";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { type CatalogFilterValues } from "@/components/catalog/catalog-filters";
import { CatalogShell } from "@/components/catalog/catalog-shell";
import { LocalTime } from "@/components/catalog/local-time";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { Link } from "@/i18n/navigation";
import { serverApiUrl } from "@/lib/api";
import { formatMoney } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("coachesTitle") };
}

interface SearchParams {
  /** Comma-separated ISO 639-1 codes. */
  languages?: string;
  /** Comma-separated service type values. */
  serviceTypes?: string;
  maxPrice?: string;
  page?: string;
}

async function fetchCatalog(params: SearchParams): Promise<CatalogResponse> {
  const query = new URLSearchParams();
  if (params.languages) query.set("languages", params.languages);
  if (params.serviceTypes) query.set("serviceTypes", params.serviceTypes);
  const maxPrice = Number(params.maxPrice);
  if (params.maxPrice && Number.isFinite(maxPrice) && maxPrice >= 0) {
    query.set("maxPriceMinor", String(Math.round(maxPrice * 100)));
  }
  if (params.page) query.set("page", params.page);
  try {
    const response = await fetch(`${serverApiUrl()}/pros?${query.toString()}`, {
      cache: "no-store",
    });
    if (response.ok) {
      return (await response.json()) as CatalogResponse;
    }
  } catch {
    // Fall through to the empty catalog below.
  }
  return { items: [], total: 0, page: 1, pageSize: CATALOG_PAGE_SIZE };
}

export default async function CoachesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, filters] = await Promise.all([params, searchParams]);
  const catalog = await fetchCatalog(filters);
  const t = await getTranslations("catalog");

  const splitList = (value?: string) =>
    value ? value.split(",").filter(Boolean) : [];
  const initialFilters: CatalogFilterValues = {
    languages: splitList(filters.languages),
    serviceTypes: splitList(filters.serviceTypes),
    maxPrice: filters.maxPrice ?? "",
  };
  const totalPages = Math.max(1, Math.ceil(catalog.total / catalog.pageSize));
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (filters.languages) query.set("languages", filters.languages);
    if (filters.serviceTypes) query.set("serviceTypes", filters.serviceTypes);
    if (filters.maxPrice) query.set("maxPrice", filters.maxPrice);
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return suffix ? `/coaches?${suffix}` : "/coaches";
  };

  return (
    <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 pb-16 sm:px-8">
      <header className="pb-6 pt-10">
        <h1 className="text-[32px] font-bold text-text">🏓 {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>

      <CatalogShell initial={initialFilters}>
        <>
          {catalog.items.length === 0 ? (
            <div className="rounded-card border border-border p-10 text-center">
              <div className="text-3xl">🔍</div>
              <div className="mt-2 font-semibold text-text">
                {t("empty.title")}
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {t("empty.subtitle")}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
              {catalog.items.map((coach) => (
                <li
                  key={coach.id}
                  className="rounded-card border border-border bg-bg p-5"
                >
                  <div className="flex items-start gap-3">
                    <UserAvatar
                      displayName={coach.displayName}
                      avatarUrl={coach.avatarUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/coaches/${coach.id}`}
                          className="font-semibold text-text hover:underline"
                        >
                          {coach.displayName}
                        </Link>
                        <span className="rounded bg-[#D6E4F5] px-1.5 py-0.5 text-[11px] font-medium text-[#2A5FC7]">
                          ✓ {t("card.verified")}
                        </span>
                      </div>
                      <div className="mt-1 text-[13px] text-text-secondary">
                        {coach.languages
                          .map((code) => LOCALE_LABELS[code as Locale] ?? code)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {coach.services.map((service) => (
                      <span
                        key={service.type}
                        className="rounded bg-bg-secondary px-2 py-0.5 text-xs text-text-secondary"
                      >
                        {t(`service.${service.type}`)}
                        {service.type === "game" && service.venueLabel
                          ? ` · 📍 ${service.venueLabel}`
                          : null}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
                    <div>
                      <div className="text-[13px] text-text-secondary">
                        {t("card.from")}
                      </div>
                      <div className="text-lg font-bold text-text">
                        {formatMoney(
                          coach.priceFromMinor,
                          coach.currency,
                          locale,
                        )}
                        <span className="text-[13px] font-normal text-text-secondary">
                          /{t("card.hour")}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-text-tertiary">
                        {coach.nextSlotAt ? (
                          <>
                            {t("card.nextSlot")}{" "}
                            <LocalTime iso={coach.nextSlotAt} />
                          </>
                        ) : (
                          t("card.noSlots")
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/coaches/${coach.id}`}
                      className="rounded-lg bg-text px-3.5 py-2 text-sm font-medium text-white no-underline hover:bg-black"
                    >
                      {t("card.viewProfile")}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <nav className="mt-8 flex items-center justify-center gap-3 text-sm">
              {catalog.page > 1 ? (
                <Link
                  href={pageHref(catalog.page - 1)}
                  className="rounded-md border border-border-strong px-3 py-1.5 text-text no-underline hover:bg-bg-hover"
                >
                  ← {t("pagination.prev")}
                </Link>
              ) : null}
              <span className="text-text-secondary">
                {t("pagination.pageOf", {
                  page: catalog.page,
                  total: totalPages,
                })}
              </span>
              {catalog.page < totalPages ? (
                <Link
                  href={pageHref(catalog.page + 1)}
                  className="rounded-md border border-border-strong px-3 py-1.5 text-text no-underline hover:bg-bg-hover"
                >
                  {t("pagination.next")} →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      </CatalogShell>
    </main>
  );
}
