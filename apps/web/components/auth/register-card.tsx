"use client";

import { Role, type SignupRole } from "@playwithpro/shared";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  const [role, setRole] = useState<SignupRole>(Role.Amateur);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ role, displayName, email, password }),
    });
    if (response.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setSubmitting(false);
    setError(t("failed"));
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
    </AuthCard>
  );
}
