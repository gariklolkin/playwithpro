import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { SessionRoom } from "@/components/sessions/session-room";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/server-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("sessionRoomTitle") };
}

export default async function SessionRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect({
      href: `/login?next=/sessions/${id}/room`,
      locale: await getLocale(),
    });
    return null;
  }

  // The room descriptor is fetched client-side: the page must tick a
  // countdown and refetch when the join window opens.
  return (
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 pb-16 sm:px-8">
      <SessionRoom sessionId={id} displayName={user.displayName} />
    </main>
  );
}
