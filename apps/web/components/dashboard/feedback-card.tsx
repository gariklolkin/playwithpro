import { getTranslations } from "next-intl/server";
import { feedbackUrl } from "@/lib/feedback-url";

/** "Help shape the platform": coach dashboard entry point to the idea board. */
export async function FeedbackCard() {
  const href = feedbackUrl("coach-dashboard");
  if (!href) return null;
  const t = await getTranslations("dashboard.professional.feedback");
  return (
    <div
      className="mt-6 rounded-card border border-border p-4"
      data-testid="feedback-card"
    >
      <div className="text-[15px] font-semibold text-text">💡 {t("title")}</div>
      <p className="mt-1 text-sm text-text-secondary">{t("body")}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="mt-3 inline-block rounded-md border border-border-strong px-3 py-1.5 text-[13px] font-medium text-text no-underline hover:bg-bg-hover"
      >
        {t("cta")} ↗
      </a>
    </div>
  );
}
