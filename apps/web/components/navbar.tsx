import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/server-user";
import { UserMenu } from "./user-menu";

export async function Navbar() {
  const [t, user] = await Promise.all([
    getTranslations("nav"),
    getCurrentUser(),
  ]);

  return (
    <nav className="flex w-full items-center gap-5 border-b border-border bg-bg px-8 py-3">
      <Link
        href="/"
        className="flex items-center gap-2 text-[17px] font-bold text-text no-underline"
      >
        🏓 PlayWithPro
      </Link>
      <div className="ml-3 hidden gap-1 sm:flex">
        {[
          { label: t("findCoach"), href: "#" },
          { label: t("howItWorks"), href: "/#how-it-works" },
          { label: t("forCoaches"), href: "/register?role=professional" },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
          >
            {item.label}
          </a>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <select
          aria-label={t("language")}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] text-text-secondary"
          defaultValue="en"
        >
          <option value="en">🌐 EN</option>
          <option value="fr">FR</option>
          <option value="de">DE</option>
          <option value="ru">RU</option>
          <option value="zh">中文</option>
        </select>
        {user ? (
          <UserMenu
            displayName={user.displayName}
            labels={{
              dashboard: t("dashboard"),
              settings: t("settings"),
              logout: t("logout"),
            }}
          />
        ) : (
          <>
            <Link
              href="/login"
              className="hidden rounded-md border border-border-strong px-3.5 py-1.5 text-sm font-medium text-text no-underline transition-colors hover:bg-bg-hover sm:block"
            >
              {t("login")}
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-[#2E7DE1] px-3.5 py-1.5 text-sm font-medium text-white no-underline transition-colors hover:bg-[#2569C3]"
            >
              {t("getStarted")}
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
