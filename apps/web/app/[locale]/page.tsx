import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SUPPORTED_LOCALES } from "@playwithpro/shared";
import { Link } from "@/i18n/navigation";
import { LOCALE_LABELS } from "@/i18n/locale-labels";

const STEP_STYLES = [
  { key: "step1", bg: "#D3E5EF", emoji: "📹" },
  { key: "step2", bg: "#FDECC8", emoji: "🗓️" },
  { key: "step3", bg: "#DBEDDB", emoji: "💬" },
] as const;

export default async function Home() {
  const t = await getTranslations("home");

  const bold = (chunks: React.ReactNode) => (
    <b className="font-semibold text-text">{chunks}</b>
  );

  return (
    <main className="flex flex-1 flex-col items-center bg-bg">
      <div className="w-full max-w-[1320px] px-5 sm:px-8">
        {/* Hero */}
        <section className="pt-14 pb-6 text-center">
          <h1 className="mx-auto max-w-[880px] text-[40px] font-extrabold leading-[1.06] tracking-[-1px] text-text sm:text-[62px] sm:tracking-[-1.8px]">
            {t.rich("heroTitle", {
              accent: (chunks) => (
                <span className="inline-block rounded-full bg-[#D3E5EF] px-[18px] pb-1 leading-[1.05]">
                  <span className="mr-2 inline-block h-3.5 w-3.5 translate-y-px rounded-full bg-[#2383E2] align-middle" />
                  {chunks}
                </span>
              ),
            })}
          </h1>
          <p className="mx-auto mt-4 max-w-[620px] text-lg text-text-secondary sm:text-xl">
            {t("heroSubtitle")}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="rounded-lg bg-[#2E7DE1] px-[22px] py-[11px] text-[15px] font-semibold text-white no-underline transition-colors hover:bg-[#2569C3]"
            >
              {t("ctaFindCoach")}
            </Link>
            <Link
              href="/register?role=professional"
              className="rounded-lg bg-[#EAF2FD] px-[22px] py-[11px] text-[15px] font-semibold text-[#2A5FC7] no-underline transition-colors hover:bg-[#DCEAFB]"
            >
              {t("ctaProfessional")}
            </Link>
          </div>

          {/* Illustration — white-background artwork blends into the page (per design mockup) */}
          <div className="mx-auto mt-10 max-w-[900px]">
            <Image
              src="/hero-players.jpg"
              alt={t("heroImageAlt")}
              width={1400}
              height={933}
              priority
              className="h-auto w-full rounded-[20px] border border-border shadow-[0_4px_16px_rgba(15,15,15,0.06)]"
            />
          </div>
        </section>

        {/* Trust strip */}
        <section className="mx-auto max-w-[1200px]">
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-2 border-y border-border py-5 text-sm text-text-secondary">
            <div>✅ {t.rich("trustVerified", { b: bold })}</div>
            <div>🔒 {t.rich("trustEscrow", { b: bold })}</div>
            <div>🎥 {t.rich("trustVideo", { b: bold })}</div>
            <div>🌍 {t.rich("trustLanguages", { b: bold })}</div>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 py-10 sm:grid-cols-3">
          {STEP_STYLES.map((step) => (
            <div
              key={step.key}
              className="rounded-card p-6"
              style={{ background: step.bg }}
            >
              <div className="mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-white text-2xl shadow-[0_1px_3px_rgba(15,15,15,0.1)]">
                {step.emoji}
              </div>
              <h3 className="mb-1.5 text-base font-semibold text-text">
                {t(`${step.key}Title`)}
              </h3>
              <p className="text-sm text-text-secondary">
                {t(`${step.key}Body`)}
              </p>
            </div>
          ))}
        </section>
      </div>

      <footer className="pb-12 text-center text-[13px] text-text-tertiary">
        PlayWithPro ·{" "}
        {SUPPORTED_LOCALES.map((locale) => LOCALE_LABELS[locale]).join(" · ")}
      </footer>
    </main>
  );
}
