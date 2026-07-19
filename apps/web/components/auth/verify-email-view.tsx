"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AuthCard } from "./auth-card";
import { EmailCodeForm, PENDING_EMAIL_KEY } from "./email-code-form";

/** Standalone code entry for users who left the signup screen (or came from login). */
export function VerifyEmailView() {
  const t = useTranslations("auth.verifyEmail");
  const [email, setEmail] = useState("");

  // Prefill from the login/register hand-off; the address never rides in the
  // URL. sessionStorage only exists client-side, hence the post-mount sync.
  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_EMAIL_KEY);
    if (pending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of an external store on mount
      setEmail(pending);
    }
  }, []);

  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <AuthCard title={t("title")}>
        <p className="mb-4 text-sm text-text-secondary">{t("info")}</p>
        <EmailCodeForm email={email} onEmailChange={setEmail} />
      </AuthCard>
    </div>
  );
}
