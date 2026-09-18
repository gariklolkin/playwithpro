import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_KEYS,
  currentLegalVersion,
  findLegalVersion,
  isLegalDocument,
  type LegalDocument,
  type PlatformFacts,
} from "@playwithpro/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ConsentControl } from "@/components/consent/consent-control";
import { LegalMarkdown } from "@/components/legal/legal-markdown";
import { Link } from "@/i18n/navigation";
import { serverApiUrl } from "@/lib/api";
import { readLegalDocument } from "@/lib/legal/content";
import { fillTokens, parseMarkdown } from "@/lib/legal/markdown";

type Params = Promise<{ locale: string; document: string; version?: string[] }>;

async function fetchFacts(): Promise<PlatformFacts | null> {
  try {
    const response = await fetch(`${serverApiUrl()}/platform-facts`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return (await response.json()) as PlatformFacts;
  } catch {
    return null;
  }
}

export function generateStaticParams() {
  return LEGAL_DOCUMENT_KEYS.map((document) => ({ document }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { document } = await params;
  const t = await getTranslations("legal");
  return {
    title: isLegalDocument(document) ? t(`documents.${document}`) : t("title"),
  };
}

/**
 * A legal document at its current or a given version, in the page locale:
 * the registry says what exists, the Markdown file says what it says, and
 * the platform facts fill every number so no text hard-codes one.
 */
export default async function LegalDocumentPage({
  params,
}: {
  params: Params;
}) {
  const { locale, document, version: versionSegments } = await params;
  if (!isLegalDocument(document) || (versionSegments?.length ?? 0) > 1) {
    notFound();
  }
  const doc: LegalDocument = document;
  const entry = LEGAL_DOCUMENTS[doc];
  const version = versionSegments?.[0]
    ? findLegalVersion(doc, versionSegments[0])
    : currentLegalVersion(doc);
  if (!version) notFound();
  const [source, facts, t, format] = await Promise.all([
    readLegalDocument(doc, version.version, locale),
    fetchFacts(),
    getTranslations("legal"),
    getFormatter(),
  ]);
  if (source === null) notFound();
  const blocks = parseMarkdown(
    fillTokens(source, (facts ?? {}) as unknown as Record<string, string>),
  );
  const current = currentLegalVersion(doc).version === version.version;
  const title = blocks.find(
    (block) => block.kind === "heading" && block.level === 1,
  );

  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-5 pb-24 sm:px-8">
      <p className="pt-8 text-[13px] text-text-tertiary">
        <Link href="/legal/terms" className="hover:text-text">
          {t("title")}
        </Link>
      </p>
      <h1 className="mt-2 text-[26px] font-bold text-text">
        {title?.kind === "heading"
          ? title.inlines.map((inline) => inline.text).join("")
          : t(`documents.${doc}`)}
      </h1>
      <p className="mt-2 text-[13px] text-text-secondary">
        {t("versionLine", {
          version: version.version,
          effective: format.dateTime(new Date(version.effectiveAt), {
            dateStyle: "long",
          }),
        })}
        {!current ? ` · ${t("olderVersion")}` : ""}
      </p>
      {entry.draft ? (
        <p
          className="mt-3 rounded-md bg-[#FDECC8] p-3 text-[13px] text-[#402C1B]"
          data-testid="legal-draft"
        >
          {t("draft")}
        </p>
      ) : null}
      {locale !== entry.authoritativeLocale ? (
        <p className="mt-3 text-[13px] text-text-tertiary">
          {t("convenience", { locale: entry.authoritativeLocale })}
        </p>
      ) : null}
      {!current ? (
        <p className="mt-3 text-[13px]">
          <Link href={`/legal/${doc}`} className="text-accent">
            {t("readCurrent")}
          </Link>
        </p>
      ) : null}

      <LegalMarkdown blocks={blocks} />

      {doc === "privacy" ? (
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold text-text">
            {t("cookieSettingsTitle")}
          </h2>
          <p className="mb-3 mt-2 text-sm text-text-secondary">
            {t("cookieSettingsBody")}
          </p>
          <ConsentControl />
        </section>
      ) : null}

      <section className="mt-10 border-t border-border pt-4 text-[13px] text-text-tertiary">
        {t("versionsTitle")}:{" "}
        {entry.versions.map((item, index) => (
          <span key={item.version}>
            {index > 0 ? " · " : ""}
            <Link
              href={`/legal/${doc}/${item.version}`}
              className="hover:text-text"
            >
              {item.version}
            </Link>
          </span>
        ))}
      </section>
    </main>
  );
}
