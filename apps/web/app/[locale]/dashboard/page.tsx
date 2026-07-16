import { Role } from "@playwithpro/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { VerifyEmailBanner } from "@/components/dashboard/verify-email-banner";
import { getCurrentUser } from "@/lib/server-user";

export const metadata: Metadata = { title: "Dashboard — PlayWithPro" };

const NAV_KEYS: Record<Role, { section: string; items: string[] }> = {
  [Role.Amateur]: {
    section: "amateur",
    items: ["sessions", "videos", "payments", "settings"],
  },
  [Role.Professional]: {
    section: "professional",
    items: [
      "overview",
      "availability",
      "bookings",
      "earnings",
      "profile",
      "settings",
    ],
  },
  [Role.Admin]: {
    section: "admin",
    items: ["verification", "disputes", "users", "transactions", "analytics"],
  },
};

const NAV_EMOJI: Record<string, string> = {
  sessions: "🗓️",
  videos: "📹",
  payments: "💳",
  settings: "⚙️",
  overview: "📊",
  availability: "🗓️",
  bookings: "📒",
  earnings: "💰",
  profile: "🏆",
  verification: "✅",
  disputes: "⚖️",
  users: "👥",
  transactions: "💳",
  analytics: "📈",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const t = await getTranslations("dashboard");
  const { section, items } = NAV_KEYS[user.role];

  return (
    <div className="grid min-h-[600px] flex-1 grid-cols-1 md:grid-cols-[220px_1fr]">
      <aside className="hidden border-r border-border bg-bg-secondary px-3 py-5 md:block">
        {items.map((item, index) => (
          <div
            key={item}
            className={`mb-0.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
              index === 0
                ? "bg-black/5 font-medium text-text"
                : "text-text-secondary"
            }`}
          >
            <span aria-hidden>{NAV_EMOJI[item]}</span>
            {t(`${section}.nav.${item}`)}
          </div>
        ))}
      </aside>
      <main className="px-6 py-8 md:px-10">
        {!user.emailVerified ? <VerifyEmailBanner email={user.email} /> : null}
        <h1 className="text-[28px] font-bold text-text">
          {t(`${section}.title`)}
        </h1>
        <p className="mt-1 text-text-secondary">
          {t("greeting", { name: user.displayName })}
        </p>
        <div className="mt-8 rounded-card border border-border p-10 text-center">
          <div className="text-3xl">🏓</div>
          <div className="mt-2 font-semibold text-text">{t("emptyTitle")}</div>
          <p className="mt-1 text-sm text-text-secondary">
            {t(`${section}.empty`)}
          </p>
        </div>
      </main>
    </div>
  );
}
