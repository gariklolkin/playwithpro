import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RegisterCard } from "@/components/auth/register-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("registerTitle") };
}

export default function RegisterPage() {
  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <Suspense>
        <RegisterCard />
      </Suspense>
    </div>
  );
}
