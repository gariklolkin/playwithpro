import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

/** The tracking note moved into the privacy policy; the consent banner's old link still lands there. */
export default async function PrivacyRedirect() {
  redirect({ href: "/legal/privacy", locale: await getLocale() });
  return null;
}
