"use client";

import type {
  CancellationPolicy,
  CancellationPolicyMoments,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useNow } from "@/lib/use-now";

/**
 * The platform's cancellation terms in one line, shown under the slot picker
 * before a booking exists. Every number comes from the policy itself.
 */
export function CancellationPolicySummary({
  policy,
}: {
  policy: CancellationPolicy;
}) {
  const t = useTranslations("cancellationPolicy");
  return (
    <p className="mt-2 text-[12px] leading-snug text-text-tertiary">
      {t("summary", {
        freeHours: policy.freeHours,
        percent: policy.lateRefundPercent,
        noRefundHours: policy.noRefundHours,
      })}
    </p>
  );
}

/**
 * The session's own (snapshotted) terms as concrete moments in the viewer's
 * timezone, above the pay action. A booking made inside the free window gets
 * the late-booking grace instead of a deadline that has already passed.
 */
export function CancellationPolicyBlock({
  policy,
}: {
  policy: CancellationPolicyMoments;
}) {
  const t = useTranslations("cancellationPolicy");
  const locale = useLocale();
  const now = useNow();
  if (now === null) {
    // Local times exist only in the browser; reserve the block meanwhile.
    return (
      <section className="mt-3 rounded-md border border-border p-3 text-[13px] text-text-tertiary">
        …
      </section>
    );
  }
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  const freeOpen = new Date(policy.freeUntil).getTime() > now;

  return (
    <section
      aria-label={t("title")}
      className="mt-3 rounded-md border border-border p-3 text-[13px] leading-snug text-text-secondary"
    >
      <h3 className="font-medium text-text">
        {t("title")}{" "}
        <span className="font-normal text-text-tertiary">{t("yourTime")}</span>
      </h3>
      <ul className="mt-1 space-y-0.5">
        {freeOpen ? (
          <li>{t("freeUntil", { when: when(policy.freeUntil) })}</li>
        ) : policy.graceUntil ? (
          <li>{t("grace", { minutes: policy.graceMinutes })}</li>
        ) : null}
        <li>
          {t("partialUntil", {
            percent: policy.lateRefundPercent,
            when: when(policy.partialUntil),
          })}
        </li>
        <li>{t("noRefundAfter")}</li>
        <li>{t("coachCancels")}</li>
      </ul>
    </section>
  );
}
