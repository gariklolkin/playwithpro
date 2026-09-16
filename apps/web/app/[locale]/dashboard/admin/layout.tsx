import { Role } from "@playwithpro/shared";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/server-user";

/** Gate for every admin console page: admins only. */
export default async function AdminConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login?next=/dashboard", locale: await getLocale() });
    return null;
  }
  if (user.role !== Role.Admin) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }
  // Masked as a whole in session replays: user directory, ledger, disputes.
  return <div data-ph-mask>{children}</div>;
}
