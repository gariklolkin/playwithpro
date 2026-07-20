import { Role } from "@playwithpro/shared";
import { getLocale, getTranslations } from "next-intl/server";
import {
  DashboardSidebar,
  type SidebarItem,
} from "@/components/dashboard/sidebar";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/server-user";

const NAV: Record<
  Role,
  { section: string; items: { key: string; emoji: string; href?: string }[] }
> = {
  [Role.Amateur]: {
    section: "amateur",
    items: [
      { key: "sessions", emoji: "🗓️" },
      { key: "videos", emoji: "📹", href: "/dashboard/videos" },
      { key: "payments", emoji: "💳" },
      { key: "profile", emoji: "🏓", href: "/dashboard/profile" },
      { key: "settings", emoji: "⚙️", href: "/settings/account" },
    ],
  },
  [Role.Professional]: {
    section: "professional",
    items: [
      { key: "overview", emoji: "📊" },
      { key: "availability", emoji: "🗓️", href: "/dashboard/availability" },
      { key: "bookings", emoji: "📒" },
      { key: "earnings", emoji: "💰" },
      { key: "profile", emoji: "🏆", href: "/dashboard/profile" },
      { key: "settings", emoji: "⚙️", href: "/settings/account" },
    ],
  },
  [Role.Admin]: {
    section: "admin",
    items: [
      { key: "verification", emoji: "✅", href: "/dashboard/verification" },
      { key: "disputes", emoji: "⚖️" },
      { key: "users", emoji: "👥" },
      { key: "transactions", emoji: "💳" },
      { key: "analytics", emoji: "📈" },
    ],
  },
};

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login?next=/dashboard", locale: await getLocale() });
    return null;
  }

  const t = await getTranslations("dashboard");
  const { section, items } = NAV[user.role];
  const sidebarItems: SidebarItem[] = items.map((item) => ({
    ...item,
    label: t(`${section}.nav.${item.key}`),
  }));

  return (
    <div className="grid min-h-[600px] flex-1 grid-cols-1 md:grid-cols-[220px_1fr]">
      <DashboardSidebar items={sidebarItems} />
      <main className="px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}
