import {
  Locale,
  Role,
  ServiceType,
  type PublicAvailabilitySlot,
  type PublicProProfileResponse,
} from "@playwithpro/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BookingPanel } from "@/components/booking/booking-panel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { Link } from "@/i18n/navigation";
import { serverApiUrl } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { getCurrentUser } from "@/lib/server-user";

const SERVICE_EMOJI: Record<ServiceType, string> = {
  [ServiceType.VideoAnalysis]: "📹",
  [ServiceType.Consultation]: "💬",
  [ServiceType.Game]: "🏓",
};

async function fetchPublic<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${serverApiUrl()}${path}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("coachesTitle") };
}

export default async function CoachPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const [profile, slots, user] = await Promise.all([
    fetchPublic<PublicProProfileResponse>(`/pros/${id}/profile`),
    fetchPublic<PublicAvailabilitySlot[]>(`/pros/${id}/slots`),
    getCurrentUser(),
  ]);
  if (!profile) {
    notFound();
  }
  const t = await getTranslations("coach");
  const tCatalog = await getTranslations("catalog");

  const viewer =
    user === null ? "guest" : user.role === Role.Amateur ? "amateur" : "other";

  return (
    <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 pb-24 sm:px-8">
      <nav className="pt-6 text-sm">
        <Link
          href="/coaches"
          className="text-text-secondary no-underline hover:text-text"
        >
          ← {t("backToCatalog")}
        </Link>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-10 min-[900px]:grid-cols-[1fr_360px]">
        <article>
          <header className="flex items-center gap-4">
            <UserAvatar
              displayName={profile.displayName}
              avatarUrl={profile.avatarUrl}
              size="lg"
            />
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-[28px] font-bold text-text">
                {profile.displayName}
                <span className="rounded bg-[#D6E4F5] px-2 py-0.5 text-xs font-medium text-[#2A5FC7]">
                  ✓ {tCatalog("card.verified")}
                </span>
              </h1>
              <div className="mt-1 text-sm text-text-secondary">
                🌐{" "}
                {profile.languages
                  .map((code) => LOCALE_LABELS[code as Locale] ?? code)
                  .join(" · ")}
              </div>
            </div>
          </header>

          {profile.bio ? (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-text">
                {t("aboutTitle")}
              </h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-text-secondary">
                {profile.bio}
              </p>
            </section>
          ) : null}

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-text">
              {t("servicesTitle")}
            </h2>
            <ul className="mt-3 space-y-2">
              {profile.services.map((service) => (
                <li
                  key={service.type}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border p-4"
                >
                  <div>
                    <div className="font-medium text-text">
                      {SERVICE_EMOJI[service.type]}{" "}
                      {tCatalog(`service.${service.type}`)}
                    </div>
                    {service.type === ServiceType.Game && service.venueLabel ? (
                      <div className="mt-0.5 text-[13px] text-text-secondary">
                        📍 {service.venueLabel}
                      </div>
                    ) : null}
                  </div>
                  <div className="font-semibold text-text">
                    {formatMoney(service.priceMinor, service.currency, locale)}
                    <span className="text-[13px] font-normal text-text-secondary">
                      /{tCatalog("card.hour")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </article>

        <BookingPanel
          proId={profile.id}
          services={profile.services}
          initialSlots={slots ?? []}
          viewer={viewer}
        />
      </div>
    </main>
  );
}
