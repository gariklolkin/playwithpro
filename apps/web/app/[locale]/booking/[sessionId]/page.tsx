import { type SessionResponse } from "@playwithpro/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckoutPanel } from "@/components/booking/checkout-panel";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("checkoutTitle") };
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: `/login?next=/booking/${sessionId}`,
      locale: await getLocale(),
    });
    return null;
  }
  const session = await serverApiGet<SessionResponse>(`/sessions/${sessionId}`);
  if (!session) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5 pb-16 sm:px-8">
      <CheckoutPanel initialSession={session} />
    </main>
  );
}
