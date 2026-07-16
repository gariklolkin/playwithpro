import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LoginCard } from "@/components/auth/login-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("loginTitle") };
}

export default function LoginPage() {
  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <Suspense>
        <LoginCard />
      </Suspense>
    </div>
  );
}
