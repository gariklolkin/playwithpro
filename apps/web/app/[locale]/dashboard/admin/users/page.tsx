import {
  ADMIN_USERS_PAGE_SIZE,
  type AdminUserListResponse,
} from "@playwithpro/shared";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("adminUsersTitle") };
}

interface SearchParams {
  query?: string;
  role?: string;
  page?: string;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await searchParams;
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.role) params.set("role", filters.role);
  if (filters.page) params.set("page", filters.page);
  const users = await serverApiGet<AdminUserListResponse>(
    `/admin/users?${params.toString()}`,
  );
  const t = await getTranslations("adminConsole.users");

  return (
    <div className="mx-auto w-full max-w-[980px] pb-16">
      <header className="pb-2 pt-1">
        <h1 className="text-[28px] font-bold text-text">👥 {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>
      <AdminUsersTable
        data={
          users ?? {
            items: [],
            total: 0,
            page: 1,
            pageSize: ADMIN_USERS_PAGE_SIZE,
          }
        }
        query={filters.query ?? ""}
        role={filters.role ?? ""}
      />
    </div>
  );
}
