import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordView } from "@/components/auth/reset-password-view";

export const metadata: Metadata = { title: "Reset password — PlayWithPro" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordView />
    </Suspense>
  );
}
