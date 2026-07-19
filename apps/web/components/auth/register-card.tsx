"use client";

import { Role, type SignupRole } from "@playwithpro/shared";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthCard, AuthDivider, AuthFooter } from "./auth-card";
import { GoogleButton } from "./google-button";
import { RolePicker } from "./role-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterCard() {
  const t = useTranslations("auth.register");

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      }),
    });
    setSubmitting(false);
    if (response.ok) {
      // No session yet — the account activates via the emailed link.
      setDone(true);
      return;
    }
    setError(t("failed"));
  }

  if (done) {
    return (
      <AuthCard title={t("checkInboxTitle")}>
        <p className="text-sm text-text">{t("checkInbox", { email })}</p>
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
    </AuthCard>
  );
}
