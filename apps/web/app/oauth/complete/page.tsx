"use client";

import { Role, type SignupRole } from "@playwithpro/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthCard, AuthFooter } from "@/components/auth/auth-card";
import { RolePicker } from "@/components/auth/role-picker";
import { Button } from "@/components/ui/button";

export default function OAuthCompletePage() {
  const t = useTranslations("auth.oauthComplete");
  const router = useRouter();
  const [role, setRole] = useState<SignupRole>(Role.Amateur);
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const response = await apiFetch("/auth/oauth/complete", {
      method: "POST",
      body: JSON.stringify({ role }),
    });
    if (response.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setSubmitting(false);
    setExpired(true);
  }

  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <AuthCard title={t("title")} subtitle={t("subtitle")}>
        {expired ? (
          <>
            <p className="mb-4 text-sm text-[#5D1715]">{t("expired")}</p>
            <AuthFooter>
              <Link href="/login">{t("backToLogin")}</Link>
            </AuthFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <RolePicker value={role} onChange={setRole} />
            <Button type="submit" size="full" disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </form>
        )}
      </AuthCard>
    </div>
  );
}
