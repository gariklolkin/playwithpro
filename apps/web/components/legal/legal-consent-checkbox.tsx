"use client";

import { LegalDocument, Role, type SignupRole } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * The sign-up checkbox: terms accepted, privacy policy read, age confirmed —
 * unticked by default, with links to both documents (and to the coach
 * agreement when a professional is signing up, so they can read their deal
 * first). The versions it stands for travel with the request.
 */
export function LegalConsentCheckbox({
  checked,
  onChange,
  role,
  showError,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  role: SignupRole;
  showError: boolean;
}) {
  const t = useTranslations("legal.consent");
  return (
    <div className="mb-3">
      <label className="flex cursor-pointer items-start gap-2 text-[13px] leading-snug text-text">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={showError}
          className="mt-0.5"
        />
        <span>
          {t.rich("label", {
            terms: (chunks) => (
              <Link
                href={`/legal/${LegalDocument.Terms}`}
                className="text-accent"
                target="_blank"
              >
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link
                href={`/legal/${LegalDocument.Privacy}`}
                className="text-accent"
                target="_blank"
              >
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      {role === Role.Professional ? (
        <p className="mt-1.5 pl-6 text-[12px] text-text-secondary">
          {t.rich("coachHint", {
            agreement: (chunks) => (
              <Link
                href={`/legal/${LegalDocument.CoachAgreement}`}
                className="text-accent"
                target="_blank"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}
      {showError ? (
        <p role="alert" className="mt-1.5 pl-6 text-[12px] text-[#E03E3E]">
          {t("required")}
        </p>
      ) : null}
    </div>
  );
}
