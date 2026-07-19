"use client";

import { EMAIL_CODE_LENGTH } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Hand-off between the login card and /verify-email — never put the address in a URL. */
export const PENDING_EMAIL_KEY = "pendingVerificationEmail";

/** 6-digit code entry; a correct code signs the user in and goes straight to the dashboard. */
export function EmailCodeForm({
  email,
  onEmailChange,
}: {
  email: string;
  /** When set, the form also renders an editable email field (the /verify-email page). */
  onEmailChange?: (value: string) => void;
}) {
  const t = useTranslations("auth.verifyEmail");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResent(false);
    const response = await apiFetch("/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    if (response.ok) {
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setSubmitting(false);
    setError(response.status === 429 ? t("tooMany") : t("invalid"));
  }

  async function handleResend() {
    setError(null);
    setCode("");
    await apiFetch("/auth/email/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setResent(true);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {onEmailChange ? (
        <>
          <Label htmlFor="verify-email">{t("email")}</Label>
          <Input
            id="verify-email"
            type="email"
            autoComplete="email"
            required
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="mb-3"
          />
        </>
      ) : null}
      <Label htmlFor="verify-code">{t("codeLabel")}</Label>
      <Input
        id="verify-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        maxLength={EMAIL_CODE_LENGTH}
        placeholder="••••••"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        className="mb-3 text-center text-lg tracking-[0.4em]"
      />
      {error ? (
        <p role="alert" className="mb-3 text-[13px] text-[#E03E3E]">
          {error}
        </p>
      ) : null}
      {resent ? (
        <p className="mb-3 text-[13px] text-text-secondary">{t("resent")}</p>
      ) : null}
      <Button
        type="submit"
        size="full"
        disabled={
          submitting || code.length !== EMAIL_CODE_LENGTH || email.length === 0
        }
      >
        {submitting ? t("submitting") : t("submit")}
      </Button>
      <p className="mt-3 text-center text-[13px] text-text-secondary">
        {t("noCode")}{" "}
        <button
          type="button"
          onClick={() => void handleResend()}
          className="cursor-pointer font-medium text-accent underline"
        >
          {t("resend")}
        </button>
      </p>
    </form>
  );
}
