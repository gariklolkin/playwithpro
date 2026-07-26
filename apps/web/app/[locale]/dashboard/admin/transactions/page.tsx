import {
  ADMIN_PAYMENTS_PAGE_SIZE,
  PaymentStatus,
  type AdminPaymentListResponse,
} from "@playwithpro/shared";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("adminTransactionsTitle") };
}

const STATUS_TAG_CLASSES: Record<PaymentStatus, string> = {
  [PaymentStatus.RequiresHold]: "bg-bg-secondary text-text-secondary",
  [PaymentStatus.Held]: "bg-[#FDECC8] text-[#402C1B]",
  [PaymentStatus.Failed]: "bg-[#FFE2DD] text-[#5D1715]",
  [PaymentStatus.Released]: "bg-[#DBEDDB] text-[#1C7A46]",
  [PaymentStatus.Refunded]: "bg-[#D6E4F5] text-[#2A5FC7]",
};

function ledgerHref(status: string, page: number): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix
    ? `/dashboard/admin/transactions?${suffix}`
    : "/dashboard/admin/transactions";
}

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.page) params.set("page", filters.page);
  const ledger = (await serverApiGet<AdminPaymentListResponse>(
    `/admin/payments?${params.toString()}`,
  )) ?? { items: [], total: 0, page: 1, pageSize: ADMIN_PAYMENTS_PAGE_SIZE };
  const t = await getTranslations("adminConsole.transactions");
  const tStatus = await getTranslations("adminConsole.paymentStatus");
  const format = await getFormatter();
  const locale = await getLocale();
  const totalPages = Math.max(1, Math.ceil(ledger.total / ledger.pageSize));
  const status = filters.status ?? "";

  return (
    <div className="mx-auto w-full max-w-[980px] pb-16">
      <header className="pb-2 pt-1">
        <h1 className="text-[28px] font-bold text-text">💳 {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>

      <nav className="mt-4 flex flex-wrap gap-1.5">
        <Link
          href={ledgerHref("", 1)}
          className={`rounded px-2.5 py-1 text-[13px] no-underline ${
            status === ""
              ? "bg-text font-medium text-white"
              : "bg-bg-secondary text-text-secondary hover:bg-bg-hover"
          }`}
        >
          {t("allStatuses")}
        </Link>
        {Object.values(PaymentStatus).map((value) => (
          <Link
            key={value}
            href={ledgerHref(value, 1)}
            className={`rounded px-2.5 py-1 text-[13px] no-underline ${
              status === value
                ? "bg-text font-medium text-white"
                : "bg-bg-secondary text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {tStatus(value)}
          </Link>
        ))}
      </nav>

      {ledger.items.length === 0 ? (
        <div className="mt-6 rounded-card border border-border p-10 text-center">
          <div className="text-3xl">💳</div>
          <p className="mt-2 text-sm text-text-secondary">{t("empty")}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-secondary text-left text-[12px] uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-2 font-medium">{t("columns.date")}</th>
                <th className="px-4 py-2 font-medium">
                  {t("columns.parties")}
                </th>
                <th className="px-4 py-2 font-medium">{t("columns.amount")}</th>
                <th className="px-4 py-2 font-medium">{t("columns.fee")}</th>
                <th className="px-4 py-2 font-medium">{t("columns.status")}</th>
                <th className="px-4 py-2 font-medium">
                  {t("columns.reference")}
                </th>
              </tr>
            </thead>
            <tbody>
              {ledger.items.map((payment) => (
                <tr
                  key={payment.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-2.5 text-text-secondary">
                    {format.dateTime(new Date(payment.createdAt), {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-text">
                      {payment.playerDisplayName}
                    </span>{" "}
                    <span className="text-text-tertiary">→</span>{" "}
                    <span className="font-medium text-text">
                      {payment.coachDisplayName}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-text">
                    {formatMoney(payment.amountMinor, payment.currency, locale)}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {formatMoney(payment.feeMinor, payment.currency, locale)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_TAG_CLASSES[payment.status]}`}
                    >
                      {tStatus(payment.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-text-tertiary">
                    {payment.providerRef ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
          {ledger.page > 1 ? (
            <Link
              href={ledgerHref(status, ledger.page - 1)}
              className="rounded-md border border-border-strong px-3 py-1.5 text-text no-underline hover:bg-bg-hover"
            >
              ← {t("pagination.prev")}
            </Link>
          ) : null}
          <span className="text-text-secondary">
            {t("pagination.pageOf", { page: ledger.page, total: totalPages })}
          </span>
          {ledger.page < totalPages ? (
            <Link
              href={ledgerHref(status, ledger.page + 1)}
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
