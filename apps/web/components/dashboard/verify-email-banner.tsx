"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function VerifyEmailBanner({ email }: { email: string }) {
  const t = useTranslations("nav");
  const [resent, setResent] = useState(false);

  async function handleResend() {
    await apiFetch("/auth/email/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setResent(true);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-[#FDECC8] px-4 py-2.5 text-[13.5px] text-[#402C1B]">
      <span>✉️ {resent ? t("verifyResent") : t("verifyBanner")}</span>
      {!resent ? (
        <button
          onClick={() => void handleResend()}
          className="cursor-pointer font-semibold underline"
        >
          {t("verifyResend")}
        </button>
      ) : null}
    </div>
  );
}
