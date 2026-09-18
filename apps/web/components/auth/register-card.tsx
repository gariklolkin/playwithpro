"use client";

import {
  LegalDocument,
  Role,
  currentLegalVersion,
  type SignupRole,
} from "@playwithpro/shared";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthCard, AuthDivider, AuthFooter } from "./auth-card";
import { EmailCodeForm, PENDING_EMAIL_KEY } from "./email-code-form";
import { GoogleButton } from "./google-button";
import { RolePicker } from "./role-picker";
import { LegalConsentCheckbox } from "@/components/legal/legal-consent-checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterCard() {
  const t = useTranslations("auth.register");
  const tNav = useTranslations("nav");
  const locale = useLocale();

  // "For pros" entry points deep-link here with ?role=professional.
  const preselected =
    useSearchParams().get("role") === Role.Professional
      ? Role.Professional
      : Role.Amateur;
  const [role, setRole] = useState<SignupRole>(preselected);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!consent) {
      setConsentMissing(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    const response = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        role,
        displayName,
        email,
        password,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        // The versions this form linked to: the API refuses stale ones.
        acceptedTerms: currentLegalVersion(LegalDocument.Terms).version,
        acceptedPrivacy: currentLegalVersion(LegalDocument.Privacy).version,
        locale,
      }),
    });
    setSubmitting(false);
    if (response.ok) {
      // No session yet — the account activates once the emailed code is typed.
      sessionStorage.setItem(PENDING_EMAIL_KEY, email);
      setDone(true);
      return;
    }
    setError(response.status === 409 ? t("emailTaken") : t("failed"));
  }

  if (done) {
    return (
      <AuthCard title={t("checkInboxTitle")}>
        <p className="mb-4 text-sm text-text">{t("checkInbox", { email })}</p>
        <EmailCodeForm email={email} />
        <AuthFooter>
          {t("haveAccount")} <Link href="/login">{t("logIn")}</Link>
        </AuthFooter>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <form onSubmit={handleSubmit} noValidate>
        <RolePicker value={role} onChange={setRole} />
        <Label htmlFor="register-name">{t("displayName")}</Label>
        <Input
          id="register-name"
          autoComplete="name"
          required
          placeholder={t("displayNamePlaceholder")}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="mb-3"
        />
        <Label htmlFor="register-email">{t("email")}</Label>
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          required
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mb-3"
        />
        <Label htmlFor="register-password">{t("password")}</Label>
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-3"
        />
        <LegalConsentCheckbox
          checked={consent}
          onChange={(value) => {
            setConsent(value);
            if (value) setConsentMissing(false);
          }}
          role={role}
          showError={consentMissing}
        />
        {error ? (
          <p role="alert" className="mb-3 text-[13px] text-[#E03E3E]">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="full" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </form>
      <AuthDivider>{t("or")}</AuthDivider>
      <GoogleButton label={t("google")} />
      <AuthFooter>{t("footer")}</AuthFooter>
      <AuthFooter>
        {t("haveAccount")} <Link href="/login">{t("logIn")}</Link>
      </AuthFooter>
      <AuthFooter>
        <Link href="/legal/privacy">{tNav("privacy")}</Link>
      </AuthFooter>
    </AuthCard>
  );
}
