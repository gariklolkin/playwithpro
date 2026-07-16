"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthCard, AuthFooter } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    await apiFetch("/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setSent(true);
  }

  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <AuthCard title={t("title")} subtitle={t("subtitle")}>
        {sent ? (
          <p className="text-sm text-text">{t("sent")}</p>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <Label htmlFor="forgot-email">{t("email")}</Label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mb-3"
            />
            <Button type="submit" size="full" disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </form>
        )}
        <AuthFooter>
          <Link href="/login">{t("backToLogin")}</Link>
        </AuthFooter>
      </AuthCard>
    </div>
  );
}
