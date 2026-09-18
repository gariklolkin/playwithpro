import type { LegalStatusResponse } from "@playwithpro/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { DeletionGate } from "@/components/account/deletion-gate";
import { LegalGate } from "@/components/legal/legal-gate";
import { SiteFooter } from "@/components/legal/site-footer";
import { Navbar } from "@/components/navbar";
import { ObservabilityProvider } from "@/components/observability/observability-provider";
import { SettingsDialogHost } from "@/components/settings/settings-dialog-host";
import { isObservabilityEnabled } from "@/lib/observability/config";
import {
  observabilityForRequest,
  toIdentifiedUser,
} from "@/lib/observability/server";
import { getCurrentUser, serverApiGet } from "@/lib/server-user";
import { routing } from "@/i18n/routing";
import "../globals.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const [messages, user] = await Promise.all([getMessages(), getCurrentUser()]);
  // What the signed-in user still has to accept (null for visitors).
  const legalStatus = user
    ? await serverApiGet<LegalStatusResponse>("/legal/status")
    : null;
  // Consent choice + server-evaluated flags for this request (no-op without a key).
  const observability = await observabilityForRequest(user);

  return (
    <html lang={locale} className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col bg-bg text-text">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ObservabilityProvider
            enabled={isObservabilityEnabled()}
            user={user ? toIdentifiedUser(user) : null}
            initialConsent={observability.consent}
            flags={observability.flags}
          >
            <Navbar user={user} />
            {user?.deletionScheduledFor ? (
              <DeletionGate scheduledFor={user.deletionScheduledFor} />
            ) : (
              <LegalGate initialStatus={legalStatus} locale={locale} />
            )}
            {children}
            <SiteFooter />
            {/* `useSearchParams` in a layout-level client component needs a
              Suspense boundary; the host renders nothing unless
              `?settings=` is present. */}
            {user ? (
              <Suspense fallback={null}>
                <SettingsDialogHost user={user} />
              </Suspense>
            ) : null}
          </ObservabilityProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
