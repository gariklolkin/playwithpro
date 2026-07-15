import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = { title: "Create account — PlayWithPro" };

export default function RegisterPage() {
  return <AuthScreen />;
}
