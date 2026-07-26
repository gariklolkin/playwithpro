import {
  ADMIN_REVIEWS_PAGE_SIZE,
  type AdminReviewListResponse,
} from "@playwithpro/shared";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminReviewsList } from "@/components/admin/admin-reviews-list";
import { serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("adminReviewsTitle") };
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.page) params.set("page", filters.page);
  const reviews = await serverApiGet<AdminReviewListResponse>(
    `/admin/reviews?${params.toString()}`,
  );
  const t = await getTranslations("adminConsole.reviews");

  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <header className="pb-2 pt-1">
        <h1 className="text-[28px] font-bold text-text">⭐ {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>
      <AdminReviewsList
        data={
          reviews ?? {
            items: [],
            total: 0,
            page: 1,
            pageSize: ADMIN_REVIEWS_PAGE_SIZE,
          }
        }
        query={filters.query ?? ""}
      />
    </div>
  );
}
