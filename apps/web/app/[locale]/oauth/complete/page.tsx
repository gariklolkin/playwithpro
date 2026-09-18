"use client";

import {
  LegalDocument,
  Role,
  currentLegalVersion,
  type SignupRole,
} from "@playwithpro/shared";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthCard, AuthFooter } from "@/components/auth/auth-card";
import { RolePicker } from "@/components/auth/role-picker";
import { LegalConsentCheckbox } from "@/components/legal/legal-consent-checkbox";
import { Button } from "@/components/ui/button";

export default function OAuthCompletePage() {
  const t = useTranslations("auth.oauthComplete");
  const router = useRouter();
  const [role, setRole] = useState<SignupRole>(Role.Amateur);
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const locale = useLocale();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!consent) {
      setConsentMissing(true);
      return;
    }
    setSubmitting(true);
    const response = await apiFetch("/auth/oauth/complete", {
      method: "POST",
      body: JSON.stringify({
        role,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        acceptedTerms: currentLegalVersion(LegalDocument.Terms).version,
        acceptedPrivacy: currentLegalVersion(LegalDocument.Privacy).version,
        locale,
      }),
    });
    if (response.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setSubmitting(false);
    setExpired(true);
  }

  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <AuthCard title={t("title")} subtitle={t("subtitle")}>
        {expired ? (
          <>
            <p className="mb-4 text-sm text-[#5D1715]">{t("expired")}</p>
            <AuthFooter>
              <Link href="/login">{t("backToLogin")}</Link>
            </AuthFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <RolePicker value={role} onChange={setRole} />
            <LegalConsentCheckbox
              checked={consent}
              onChange={(value) => {
                setConsent(value);
                if (value) setConsentMissing(false);
              }}
              role={role}
              showError={consentMissing}
            />
            <Button type="submit" size="full" disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </form>
        )}
      </AuthCard>
    </div>
  );
}
