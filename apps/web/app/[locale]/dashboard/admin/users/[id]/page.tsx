import { Role, type AdminUserDetail } from "@playwithpro/shared";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminUserActions } from "@/components/admin/admin-user-actions";
import { ROLE_TAG_CLASSES } from "@/components/admin/admin-users-table";
import { Link } from "@/i18n/navigation";
import { serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("adminUsersTitle") };
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] uppercase tracking-wide text-text-tertiary">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-text">{value}</dd>
    </div>
  );
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await serverApiGet<AdminUserDetail>(`/admin/users/${id}`);
  if (!user) {
    notFound();
  }
  const t = await getTranslations("adminConsole.users");
  const tRoles = await getTranslations("adminConsole.roles");
  const tSessions = await getTranslations("sessions.status");
  const format = await getFormatter();

  const sessionEntries = Object.entries(user.sessionCounts);

  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <Link
        href="/dashboard/admin/users"
        className="text-sm text-text-secondary no-underline hover:underline"
      >
        ← {t("backToList")}
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3 pb-2 pt-3">
        <div>
          <h1 className="text-[28px] font-bold text-text">
            {user.displayName}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-text-secondary">
            {user.email}
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_TAG_CLASSES[user.role]}`}
            >
              {tRoles(user.role)}
            </span>
            {user.suspendedAt ? (
              <span className="rounded bg-[#FFE2DD] px-2 py-0.5 text-xs font-medium text-[#5D1715]">
                {t("suspended")}
              </span>
            ) : null}
          </p>
        </div>
        {user.role !== Role.Admin ? (
          <AdminUserActions userId={user.id} suspendedAt={user.suspendedAt} />
        ) : null}
      </header>

      <section className="mt-4 rounded-card border border-border bg-bg p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
          {t("accountSection")}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact
            label={t("columns.registered")}
            value={format.dateTime(new Date(user.createdAt), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          />
          <Fact
            label={t("emailVerified")}
            value={user.emailVerified ? "✓" : "—"}
          />
          <Fact label={t("locale")} value={user.locale} />
          <Fact label={t("timezone")} value={user.timezone} />
          {user.suspendedAt ? (
            <Fact
              label={t("suspendedSince")}
              value={format.dateTime(new Date(user.suspendedAt), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
          ) : null}
        </dl>
      </section>

      {user.playerProfile || user.proProfile ? (
        <section className="mt-4 rounded-card border border-border bg-bg p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
            {t("profileSection")}
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {user.playerProfile ? (
              <Fact
                label={t("playerLevel")}
                value={t(`levels.${user.playerProfile.level}`)}
              />
            ) : null}
            {user.proProfile ? (
              <>
                <Fact
                  label={t("proStatus")}
                  value={t(`proStatuses.${user.proProfile.status}`)}
                />
                <Fact
                  label={t("rating")}
                  value={
                    user.proProfile.rating.ratingAvg !== null
                      ? `★ ${user.proProfile.rating.ratingAvg} (${user.proProfile.rating.ratingCount})`
                      : t("noReviews")
                  }
                />
              </>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="mt-4 rounded-card border border-border bg-bg p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
          {t("activitySection")}
        </h2>
        {sessionEntries.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">{t("noSessions")}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {sessionEntries.map(([status, count]) => (
              <span
                key={status}
                className="rounded bg-bg-secondary px-2 py-1 text-xs text-text-secondary"
              >
                {tSessions(status)}: <strong className="text-text">{count}</strong>
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-sm text-text-secondary">
          {t("paymentAttempts", { count: user.paymentAttempts })}
        </p>
      </section>
    </div>
  );
}
