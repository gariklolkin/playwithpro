import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Navbar } from "@/components/navbar";
import { SettingsDialogHost } from "@/components/settings/settings-dialog-host";
import { getCurrentUser } from "@/lib/server-user";
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

  return (
    <html lang={locale} className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col bg-bg text-text">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Navbar user={user} />
          {children}
          {/* `useSearchParams` in a layout-level client component needs a
              Suspense boundary; the host renders nothing unless
              `?settings=` is present. */}
          {user ? (
            <Suspense fallback={null}>
              <SettingsDialogHost user={user} />
            </Suspense>
          ) : null}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
