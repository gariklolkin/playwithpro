"use client";

import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";
import { AuthCard, AuthDivider, AuthFooter } from "./auth-card";
import { PENDING_EMAIL_KEY } from "./email-code-form";
import { GoogleButton } from "./google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginCard() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const oauthError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Silent session restore: a returning visitor with only a refresh cookie
  // (expired access token) is signed back in without retyping credentials.
  useEffect(() => {
    if (oauthError) {
      return;
    }
    let cancelled = false;
    void fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    }).then((response) => {
      if (!cancelled && response.ok) {
        router.replace(next);
        router.refresh();
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setUnverified(false);
    const response = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (response.ok) {
      router.push(next);
      router.refresh();
      return;
    }
    setSubmitting(false);
    if (response.status === 403) {
      // Right password, unconfirmed email — offer to confirm with a code.
      setUnverified(true);
      return;
    }
    setError(t("invalid"));
  }

  /** Sends a fresh code and moves to the code-entry screen. */
  async function handleGetCode() {
    sessionStorage.setItem(PENDING_EMAIL_KEY, email);
    await apiFetch("/auth/email/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    router.push("/verify-email");
  }

  const oauthErrorMessage =
    oauthError === "google_email"
      ? t("errorGoogleEmail")
      : oauthError
        ? t("errorGoogle")
        : null;

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      {oauthErrorMessage ? (
        <p className="mb-3 rounded-lg bg-[#FFE2DD] px-3 py-2 text-[13px] text-[#5D1715]">
          {oauthErrorMessage}
        </p>
      ) : null}
      <GoogleButton label={t("google")} />
      <AuthDivider>{t("orEmail")}</AuthDivider>
      <form onSubmit={handleSubmit} noValidate>
        <Label htmlFor="login-email">{t("email")}</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mb-3"
        />
        <Label htmlFor="login-password">{t("password")}</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
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
        {unverified ? (
          <div className="mb-3 rounded-lg bg-[#FDECC8] px-3 py-2 text-[13px] text-[#402C1B]">
            {t("unverified")}{" "}
            <button
              type="button"
              onClick={() => void handleGetCode()}
              className="cursor-pointer font-semibold underline"
            >
              {t("getCode")}
            </button>
          </div>
        ) : null}
        <Button type="submit" size="full" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </form>
      <AuthFooter>
        <Link href="/forgot-password">{t("forgot")}</Link>
      </AuthFooter>
      <AuthFooter>
        {t("noAccount")} <Link href="/register">{t("createAccount")}</Link>
      </AuthFooter>
    </AuthCard>
  );
}
