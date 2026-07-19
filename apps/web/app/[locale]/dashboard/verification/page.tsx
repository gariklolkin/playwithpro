import {
  Role,
  type AdminBookingItem,
  type AdminSlotItem,
  type AdminVerificationItem,
  type ProProfileResponse,
  type VerificationSlotResponse,
} from "@playwithpro/shared";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminVerificationTabs } from "@/components/admin/admin-verification-tabs";
import { VerificationScheduler } from "@/components/verification/verification-scheduler";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("verificationTitle") };
}

export default async function VerificationPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: "/login?next=/dashboard/verification",
      locale: await getLocale(),
    });
    return null;
  }

  if (user.role === Role.Admin) {
    const [queue, slots, bookings] = await Promise.all([
      serverApiGet<AdminVerificationItem[]>("/admin/verification-requests"),
      serverApiGet<AdminSlotItem[]>("/admin/verification-slots"),
      serverApiGet<AdminBookingItem[]>("/admin/verification-bookings"),
    ]);
    const t = await getTranslations("adminVerification");
    return (
      <div className="mx-auto w-full max-w-[860px] pb-16">
        <header className="pb-2 pt-1">
          <h1 className="text-[28px] font-bold text-text">✅ {t("title")}</h1>
        </header>
        <AdminVerificationTabs
          initialQueue={queue ?? []}
          initialSlots={slots ?? []}
          initialBookings={bookings ?? []}
        />
      </div>
    );
  }

  if (user.role !== Role.Professional) {
    redirect({ href: "/dashboard", locale: await getLocale() });
    return null;
  }

  const [profile, slots] = await Promise.all([
    serverApiGet<ProProfileResponse>("/pros/me/profile"),
    serverApiGet<VerificationSlotResponse[]>("/verification/slots"),
  ]);
  const t = await getTranslations("verification");

  if (!profile) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <header className="pb-6 pt-1">
        <h1 className="text-[28px] font-bold text-text">🛡️ {t("title")}</h1>
      </header>
      <VerificationScheduler
        initialProfile={profile}
        initialSlots={slots ?? []}
      />
    </div>
  );
}
