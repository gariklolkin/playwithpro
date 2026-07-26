"use client";

import {
  REVIEW_TEXT_MAX_LENGTH,
  type SessionResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StarRating, StarRatingInput } from "@/components/ui/star-rating";
import { apiFetch } from "@/lib/api";

/**
 * Review affordance of one past-session entry: the given stars once a review
 * exists, and the leave-review form for the player while the session is
 * review-eligible (paid-out, no review yet).
 */
export function SessionReview({
  session,
  isCoach,
}: {
  session: SessionResponse;
  isCoach: boolean;
}) {
  const t = useTranslations("sessions.review");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (session.review) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
        <StarRating value={session.review.rating} />
        <span>{isCoach ? t("receivedLabel") : t("givenLabel")}</span>
      </div>
    );
  }

  if (!session.reviewable || isCoach) {
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (rating === null) {
      return;
    }
    setBusy(true);
    setFailed(false);
    const trimmed = text.trim();
    const response = await apiFetch(`/sessions/${session.id}/review`, {
      method: "POST",
      body: JSON.stringify({
        rating,
        ...(trimmed.length > 0 ? { text: trimmed } : {}),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mt-3">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          ⭐ {t("cta")}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="mt-3 rounded-lg border border-border bg-bg-secondary p-3"
      onSubmit={(event) => void submit(event)}
    >
      <div className="text-[13px] font-medium text-text">{t("formTitle")}</div>
      <div className="mt-2">
        <StarRatingInput
          value={rating}
          onChange={setRating}
          disabled={busy}
          groupLabel={t("ratingLabel")}
          starLabel={(star) => t("starLabel", { star })}
        />
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("textPlaceholder")}
        rows={3}
        maxLength={REVIEW_TEXT_MAX_LENGTH}
        className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" type="submit" disabled={busy || rating === null}>
          {t("submit")}
        </Button>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          {t("abort")}
        </Button>
      </div>
      {failed ? (
        <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
      ) : null}
    </form>
  );
}
