import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginCard } from "@/components/auth/login-card";

export const metadata: Metadata = { title: "Log in — PlayWithPro" };

export default function LoginPage() {
  return (
    <div className="mx-auto mb-16 mt-12 w-full max-w-[460px] px-8">
      <Suspense>
        <LoginCard />
      </Suspense>
    </div>
  );
}
