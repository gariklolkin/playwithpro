"use client";

import { Role, type AdminUserListResponse } from "@playwithpro/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const ROLE_TAG_CLASSES: Record<Role, string> = {
  [Role.Amateur]: "bg-bg-secondary text-text-secondary",
  [Role.Professional]: "bg-[#D6E4F5] text-[#2A5FC7]",
  [Role.Admin]: "bg-[#FDECC8] text-[#402C1B]",
};

function listHref(query: string, role: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (role) params.set("role", role);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/dashboard/admin/users?${suffix}` : "/dashboard/admin/users";
}

export function AdminUsersTable({
  data,
  query,
  role,
}: {
  data: AdminUserListResponse;
  query: string;
  role: string;
}) {
  const t = useTranslations("adminConsole.users");
  const tRoles = useTranslations("adminConsole.roles");
  const format = useFormatter();
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  function applyFilters(nextRole: string) {
    router.replace(listHref(search.trim(), nextRole, 1));
  }

  return (
    <div className="mt-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(role);
        }}
      >
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-64"
        />
        <select
          value={role}
          onChange={(event) => applyFilters(event.target.value)}
          className="h-9 rounded-lg border border-border bg-bg px-2 text-sm text-text"
          aria-label={t("roleFilter")}
        >
          <option value="">{t("allRoles")}</option>
          {Object.values(Role).map((value) => (
            <option key={value} value={value}>
              {tRoles(value)}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="ghost">
          🔍 {t("search")}
        </Button>
      </form>

      {data.items.length === 0 ? (
        <div className="mt-6 rounded-card border border-border p-10 text-center">
          <div className="text-3xl">👥</div>
          <p className="mt-2 text-sm text-text-secondary">{t("empty")}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-secondary text-left text-[12px] uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-2 font-medium">{t("columns.user")}</th>
                <th className="px-4 py-2 font-medium">{t("columns.role")}</th>
                <th className="px-4 py-2 font-medium">
                  {t("columns.registered")}
                </th>
                <th className="px-4 py-2 font-medium">{t("columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border last:border-b-0 hover:bg-bg-hover"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/dashboard/admin/users/${user.id}`}
                      className="font-medium text-text hover:underline"
                    >
                      {user.displayName}
                    </Link>
                    <div className="text-[12px] text-text-tertiary">
                      {user.email}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_TAG_CLASSES[user.role]}`}
                    >
                      {tRoles(user.role)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {format.dateTime(new Date(user.createdAt), {
                      dateStyle: "medium",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    {user.suspendedAt ? (
                      <span className="rounded bg-[#FFE2DD] px-2 py-0.5 text-xs font-medium text-[#5D1715]">
                        {t("suspended")}
                      </span>
                    ) : (
                      <span className="rounded bg-[#DBEDDB] px-2 py-0.5 text-xs font-medium text-[#1C7A46]">
                        {t("active")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
          {data.page > 1 ? (
            <Link
              href={listHref(query, role, data.page - 1)}
              className="rounded-md border border-border-strong px-3 py-1.5 text-text no-underline hover:bg-bg-hover"
            >
              ← {t("pagination.prev")}
            </Link>
          ) : null}
          <span className="text-text-secondary">
            {t("pagination.pageOf", { page: data.page, total: totalPages })}
          </span>
          {data.page < totalPages ? (
            <Link
              href={listHref(query, role, data.page + 1)}
              className="rounded-md border border-border-strong px-3 py-1.5 text-text no-underline hover:bg-bg-hover"
            >
              {t("pagination.next")} →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
