import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConsentControl } from "@/components/consent/consent-control";
import { SUPPORT_EMAIL } from "@/components/support/support-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("privacyTitle") };
}

const SECTIONS = [
  "collect",
  "vendor",
  "purpose",
  "replay",
  "server",
  "retention",
] as const;

/**
 * Minimal localized privacy page: what is collected, by whom and where,
 * why, and how to change the choice. The full legal text arrives with the
 * legal-pages change; this page is the one the consent banner links to.
 */
export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-5 pb-24 sm:px-8">
      <h1 className="pt-10 text-[26px] font-bold text-text">🔒 {t("title")}</h1>
      <p className="mt-2 text-sm text-text-secondary">{t("intro")}</p>

      {SECTIONS.map((section) => (
        <section key={section} className="mt-8">
          <h2 className="text-[17px] font-semibold text-text">
            {t(`sections.${section}.title`)}
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
            {t(`sections.${section}.body`)}
          </p>
        </section>
      ))}

      <section className="mt-8">
        <h2 className="text-[17px] font-semibold text-text">
          {t("control.title")}
        </h2>
        <p className="mb-3 mt-2 text-sm text-text-secondary">
          {t("control.body")}
        </p>
        <ConsentControl />
      </section>

      <section className="mt-8">
        <h2 className="text-[17px] font-semibold text-text">
          {t("contact.title")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t("contact.body")}{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </section>
    </main>
  );
}
