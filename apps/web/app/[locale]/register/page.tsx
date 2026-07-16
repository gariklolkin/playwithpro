import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterCard } from "@/components/auth/register-card";

export const metadata: Metadata = { title: "Create account — PlayWithPro" };

export default function RegisterPage() {
  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <Suspense>
        <RegisterCard />
      </Suspense>
    </div>
  );
}
