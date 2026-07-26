"use client";

import type { ReviewListResponse } from "@playwithpro/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { apiFetch } from "@/lib/api";

/**
 * Public reviews section of the coach page: aggregate header plus a
 * newest-first list that loads further pages on demand.
 */
export function CoachReviews({
  proId,
  ratingAvg,
  ratingCount,
  initial,
}: {
  proId: string;
  ratingAvg: number | null;
  ratingCount: number;
  initial: ReviewListResponse;
}) {
  const t = useTranslations("coach.reviews");
  const tCatalog = useTranslations("catalog");
  const format = useFormatter();
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(initial.page);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasMore = items.length < initial.total;

  async function loadMore() {
    setBusy(true);
    setFailed(false);
    const response = await apiFetch(`/pros/${proId}/reviews?page=${page + 1}`);
    setBusy(false);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    const next = (await response.json()) as ReviewListResponse;
    setItems((existing) => [...existing, ...next.items]);
    setPage(next.page);
  }

  return (
    <section className="mt-8">
      <h2 className="flex flex-wrap items-baseline gap-2 text-lg font-semibold text-text">
        {t("title")}
        {ratingAvg !== null ? (
          <span className="flex items-baseline gap-1.5 text-[15px] font-normal text-text-secondary">
            <span className="font-semibold text-text">★ {ratingAvg}</span>
            {t("count", { count: ratingCount })}
          </span>
        ) : null}
      </h2>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">{t("empty")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((review) => (
            <li
              key={review.id}
              className="rounded-card border border-border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StarRating value={review.rating} />
                  <span className="font-medium text-text">
                    {review.playerDisplayName}
                  </span>
                </div>
                <span className="text-[13px] text-text-tertiary">
                  {tCatalog(`service.${review.serviceType}`)} ·{" "}
                  {format.dateTime(new Date(review.sessionDate), {
                    dateStyle: "medium",
                  })}
                </span>
              </div>
              {review.text ? (
                <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-text-secondary">
                  {review.text}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="mt-4">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void loadMore()}
          >
            {t("loadMore")}
          </Button>
          {failed ? (
            <p className="mt-2 text-[13px] text-[#C4554D]">{t("loadFailed")}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
