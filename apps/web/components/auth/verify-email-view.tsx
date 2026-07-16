"use client";

import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthCard } from "./auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "verifying" | "success" | "invalid" | "resent";

export function VerifyEmailView() {
  const t = useTranslations("auth.verifyEmail");
  const token = useSearchParams().get("token");
  const [status, setStatus] = useState<Status>(token ? "verifying" : "invalid");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    void apiFetch("/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }).then((response) => {
      if (!cancelled) {
        setStatus(response.ok ? "success" : "invalid");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleResend(event: React.FormEvent) {
    event.preventDefault();
    await apiFetch("/auth/email/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setStatus("resent");
  }

  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <AuthCard title={t("title")}>
        {status === "verifying" ? (
          <p className="text-sm text-text-secondary">{t("verifying")}</p>
        ) : null}

        {status === "success" ? (
          <>
            <p className="mb-4 text-sm text-text">{t("success")}</p>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-accent no-underline"
            >
              {t("goToDashboard")} →
            </Link>
          </>
        ) : null}

        {status === "invalid" ? (
          <>
            <p className="mb-2 text-sm text-[#5D1715]">{t("invalid")}</p>
            <p className="mb-4 text-sm text-text-secondary">
              {t("resendPrompt")}
            </p>
            <form onSubmit={handleResend} noValidate>
              <Label htmlFor="resend-email">{t("email")}</Label>
              <Input
                id="resend-email"
                type="email"
                autoComplete="email"
                required
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mb-3"
              />
              <Button type="submit" size="full">
                {t("resend")}
              </Button>
            </form>
          </>
        ) : null}

        {status === "resent" ? (
          <p className="text-sm text-text">{t("resent")}</p>
        ) : null}
      </AuthCard>
    </div>
  );
}
