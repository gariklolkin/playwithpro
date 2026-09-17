import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { UnsubscribeView } from "@/components/notifications/unsubscribe-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("unsubscribeTitle") };
}

/** Public: the signed token in the link is the only credential. */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <UnsubscribeView token={token ?? null} />;
}
