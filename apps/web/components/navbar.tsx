import type { MeResponse } from "@playwithpro/shared";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";

export async function Navbar({ user }: { user: MeResponse | null }) {
  const t = await getTranslations("nav");

  return (
    <nav className="flex w-full items-center gap-5 border-b border-border bg-bg px-8 py-3">
      {/* Signed-in users (players and coaches alike) land on their dashboard. */}
      <Link
        href={user ? "/dashboard" : "/"}
        className="flex items-center gap-2 text-[17px] font-bold text-text no-underline"
      >
        🏓 PlayWithPro
      </Link>
      <div className="ml-3 hidden gap-1 sm:flex">
        <Link
          href="/coaches"
          className="rounded-md px-2.5 py-1.5 text-sm text-text-secondary no-underline transition-colors hover:bg-bg-hover hover:text-text"
        >
          {t("findCoach")}
        </Link>
        {[
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
        <LocaleSwitcher isAuthenticated={Boolean(user)} />
        {user ? (
          <UserMenu
            displayName={user.displayName}
            avatarUrl={user.avatarUrl}
            labels={{
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
