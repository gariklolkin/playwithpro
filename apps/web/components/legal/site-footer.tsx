"use client";

import { LegalDocument } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { SUPPORT_EMAIL } from "@/components/support/support-panel";
import { Link } from "@/i18n/navigation";

const LINKS: Array<{ document: LegalDocument; key: string }> = [
  { document: LegalDocument.Terms, key: "terms" },
  { document: LegalDocument.Privacy, key: "privacy" },
  { document: LegalDocument.Imprint, key: "imprint" },
  { document: LegalDocument.BookingPolicy, key: "bookingPolicy" },
  { document: LegalDocument.CoachAgreement, key: "coachAgreement" },
];

/** True inside a session room, where the footer must not eat the call's height. */
export function isRoomPath(pathname: string): boolean {
  return /^\/[a-z]{2}\/sessions\/[^/]+\/room(\/|$)/.test(pathname);
}

/**
 * The site footer on every page: the legal documents, cookie settings (the
 * privacy page's consent control) and support. Compact in the room.
 */
export function SiteFooter() {
  const t = useTranslations("legal.footer");
  const compact = isRoomPath(usePathname());
  return (
    <footer
      data-testid="site-footer"
      className={`border-t border-border text-[12px] text-text-tertiary ${
        compact ? "px-4 py-1.5" : "mt-auto px-5 py-6 sm:px-8"
      }`}
    >
      <nav
        aria-label={t("aria")}
        className={`mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-1 ${
          compact ? "" : "justify-center"
        }`}
      >
        <span>{t("operator")}</span>
        {LINKS.map((link) => (
          <Link
            key={link.document}
            href={`/legal/${link.document}`}
            className="hover:text-text"
          >
            {t(link.key)}
          </Link>
        ))}
        <Link href="/legal/privacy#cookies" className="hover:text-text">
          {t("cookieSettings")}
        </Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-text">
          {t("support")}
        </a>
      </nav>
    </footer>
  );
}
