"use client";

import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthCard, AuthFooter } from "./auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordView() {
  const t = useTranslations("auth.resetPassword");
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "invalid">(
    token ? "idle" : "invalid",
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const response = await apiFetch("/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    setSubmitting(false);
    setStatus(response.ok ? "success" : "invalid");
  }

  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <AuthCard title={t("title")} subtitle={t("subtitle")}>
        {status === "success" ? (
          <>
            <p className="mb-4 text-sm text-text">{t("success")}</p>
            <Link
              href="/login"
              className="text-sm font-medium text-accent no-underline"
            >
              {t("goToLogin")} →
            </Link>
          </>
        ) : null}

        {status === "invalid" ? (
          <>
            <p className="mb-4 text-sm text-[#5D1715]">{t("invalid")}</p>
            <AuthFooter>
              <Link href="/forgot-password">{t("requestNew")}</Link>
            </AuthFooter>
          </>
        ) : null}

        {status === "idle" ? (
          <form onSubmit={handleSubmit} noValidate>
            <Label htmlFor="reset-password">{t("password")}</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mb-3"
            />
            <Button type="submit" size="full" disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </form>
        ) : null}
      </AuthCard>
    </div>
  );
}
