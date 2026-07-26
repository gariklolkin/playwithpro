import {
  DisputeOutcome,
  Role,
  type AdminAnalyticsResponse,
} from "@playwithpro/shared";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/money";
import { serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("adminAnalyticsTitle") };
}

function StatCard({
  emoji,
  label,
  value,
  detail,
}: {
  emoji: string;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-bg p-5">
      <div className="text-[13px] text-text-secondary">
        {emoji} {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-text">{value}</div>
      {detail ? (
        <div className="mt-1 text-[12px] text-text-tertiary">{detail}</div>
      ) : null}
    </div>
  );
}

/** Dependency-free bar chart: one CSS bar per day. */
function TrendBars({
  points,
  ariaLabel,
}: {
  points: { key: string; label: string; value: number }[];
  ariaLabel: string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex h-24 items-end gap-[3px]"
    >
      {points.map((point) => (
        <div
          key={point.key}
          title={`${point.label}: ${point.value}`}
          className="min-w-[4px] flex-1 rounded-t bg-[#2E7DE1]/70"
          style={{ height: `${Math.round((point.value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const analytics =
    await serverApiGet<AdminAnalyticsResponse>("/admin/analytics");
  const t = await getTranslations("adminConsole.analytics");
  const tRoles = await getTranslations("adminConsole.roles");
  const tSessions = await getTranslations("sessions.status");
  const format = await getFormatter();
  const locale = await getLocale();

  if (!analytics) {
    return (
      <div className="mx-auto w-full max-w-[980px] pb-16">
        <h1 className="pt-1 text-[28px] font-bold text-text">
          📈 {t("title")}
        </h1>
        <p className="mt-6 text-sm text-text-secondary">{t("unavailable")}</p>
      </div>
    );
  }

  const sessionsTotal = Object.values(analytics.sessions).reduce(
    (sum, count) => sum + count,
    0,
  );
  const trendLabel = (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  return (
    <div className="mx-auto w-full max-w-[980px] pb-16">
      <header className="pb-4 pt-1">
        <h1 className="text-[28px] font-bold text-text">📈 {t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("subtitle")}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          emoji="👥"
          label={t("usersCard")}
          value={analytics.users.total}
          detail={
            <>
              {Object.values(Role)
                .map(
                  (role) => `${tRoles(role)}: ${analytics.users.byRole[role]}`,
                )
                .join(" · ")}
              {analytics.users.suspended > 0
                ? ` · ${t("suspendedCount", { count: analytics.users.suspended })}`
                : null}
            </>
          }
        />
        <StatCard
          emoji="🗓️"
          label={t("sessionsCard")}
          value={sessionsTotal}
          detail={Object.entries(analytics.sessions)
            .map(([status, count]) => `${tSessions(status)}: ${count}`)
            .join(" · ")}
        />
        <StatCard
          emoji="⚖️"
          label={t("disputesCard")}
          value={analytics.disputes.open}
          detail={t("disputesDetail", {
            released: analytics.disputes.resolved[DisputeOutcome.Release],
            refunded: analytics.disputes.resolved[DisputeOutcome.Refund],
          })}
        />
      </div>

      <section className="mt-6 rounded-card border border-border bg-bg p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
          {t("moneyTitle")}
        </h2>
        {analytics.money.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">{t("noMoney")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-text-tertiary">
                  <th className="py-2 pr-4 font-medium">{t("currency")}</th>
                  <th className="py-2 pr-4 font-medium">{t("held")}</th>
                  <th className="py-2 pr-4 font-medium">{t("released")}</th>
                  <th className="py-2 pr-4 font-medium">{t("refunded")}</th>
                  <th className="py-2 font-medium">{t("feeRevenue")}</th>
                </tr>
              </thead>
              <tbody>
                {analytics.money.map((totals) => (
                  <tr
                    key={totals.currency}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="py-2.5 pr-4 font-medium text-text">
                      {totals.currency}
                    </td>
                    <td className="py-2.5 pr-4 text-text">
                      {formatMoney(totals.heldMinor, totals.currency, locale)}
                    </td>
                    <td className="py-2.5 pr-4 text-text">
                      {formatMoney(
                        totals.releasedMinor,
                        totals.currency,
                        locale,
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-text">
                      {formatMoney(
                        totals.refundedMinor,
                        totals.currency,
                        locale,
                      )}
                    </td>
                    <td className="py-2.5 font-medium text-[#1C7A46]">
                      {formatMoney(
                        totals.feeRevenueMinor,
                        totals.currency,
                        locale,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-card border border-border bg-bg p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
          {t("trendSessionsTitle")}
        </h2>
        <div className="mt-4">
          <TrendBars
            ariaLabel={t("trendSessionsTitle")}
            points={analytics.trend.map((point) => ({
              key: point.date,
              label: trendLabel(point.date),
              value: point.sessionsCreated,
            }))}
          />
          <div className="mt-1 flex justify-between text-[11px] text-text-tertiary">
            <span>{trendLabel(analytics.trend[0]?.date ?? "")}</span>
            <span>{trendLabel(analytics.trend.at(-1)?.date ?? "")}</span>
          </div>
        </div>
      </section>

      {analytics.money.map((totals) => (
        <section
          key={totals.currency}
          className="mt-6 rounded-card border border-border bg-bg p-6"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
            {t("trendReleasedTitle", { currency: totals.currency })}
          </h2>
          <div className="mt-4">
            <TrendBars
              ariaLabel={t("trendReleasedTitle", {
                currency: totals.currency,
              })}
              points={analytics.trend.map((point) => ({
                key: point.date,
                label: trendLabel(point.date),
                value:
                  point.released.find(
                    (entry) => entry.currency === totals.currency,
                  )?.amountMinor ?? 0,
              }))}
            />
            <div className="mt-1 flex justify-between text-[11px] text-text-tertiary">
              <span>{trendLabel(analytics.trend[0]?.date ?? "")}</span>
              <span>{trendLabel(analytics.trend.at(-1)?.date ?? "")}</span>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
