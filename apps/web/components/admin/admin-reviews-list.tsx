"use client";

import {
  MODERATION_REASON_MAX_LENGTH,
  type AdminReviewItem,
  type AdminReviewListResponse,
} from "@playwithpro/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";

function listHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix
    ? `/dashboard/admin/reviews?${suffix}`
    : "/dashboard/admin/reviews";
}

function ReviewCard({
  review,
  onDeleted,
}: {
  review: AdminReviewItem;
  onDeleted: () => void;
}) {
  const t = useTranslations("adminConsole.reviews");
  const format = useFormatter();
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submitDelete() {
    setBusy(true);
    setFailed(false);
    const response = await apiFetch(`/admin/reviews/${review.id}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setBusy(false);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    onDeleted();
  }

  return (
    <article className="mb-4 rounded-card bg-bg p-5 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold text-text">
            {review.playerDisplayName}
          </span>{" "}
          <span className="text-text-secondary">{t("about")}</span>{" "}
          <span className="font-semibold text-text">
            {review.coachDisplayName}
          </span>
        </div>
        <span className="text-sm">
          <span className="font-semibold text-[#D9A514]">★</span>{" "}
          <span className="font-semibold text-text">{review.rating}</span>
          <span className="ml-2 text-[12px] text-text-tertiary">
            {format.dateTime(new Date(review.createdAt), {
              dateStyle: "medium",
            })}
          </span>
        </span>
      </header>
      {review.text ? (
        <blockquote className="mt-2 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text">
          “{review.text}”
        </blockquote>
      ) : null}

      {deleting ? (
        <div className="mt-3">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
            rows={2}
            maxLength={MODERATION_REASON_MAX_LENGTH}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || reason.trim() === ""}
              onClick={() => void submitDelete()}
            >
              🗑️ {t("confirmDelete")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              {t("cancel")}
            </Button>
          </div>
          {failed ? (
            <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => setDeleting(true)}>
            🗑️ {t("deleteCta")}
          </Button>
        </div>
      )}
    </article>
  );
}

export function AdminReviewsList({
  data,
  query,
}: {
  data: AdminReviewListResponse;
  query: string;
}) {
  const t = useTranslations("adminConsole.reviews");
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="mt-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          router.replace(listHref(search.trim(), 1));
        }}
      >
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-64"
        />
        <Button type="submit" size="sm" variant="ghost">
          🔍 {t("search")}
        </Button>
      </form>

      <div className="mt-4">
        {data.items.length === 0 ? (
          <div className="rounded-card border border-border p-10 text-center">
            <div className="text-3xl">⭐</div>
            <p className="mt-2 text-sm text-text-secondary">{t("empty")}</p>
          </div>
        ) : (
          data.items.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onDeleted={() => router.refresh()}
            />
          ))
        )}
      </div>

      {totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
          {data.page > 1 ? (
            <Link
              href={listHref(query, data.page - 1)}
              className="rounded-md border border-border-strong px-3 py-1.5 text-text no-underline hover:bg-bg-hover"
            >
              ← {t("pagination.prev")}
            </Link>
          ) : null}
          <span className="text-text-secondary">
            {t("pagination.pageOf", { page: data.page, total: totalPages })}
          </span>
          {data.page < totalPages ? (
            <Link
              href={listHref(query, data.page + 1)}
              className="rounded-md border border-border-strong px-3 py-1.5 text-text no-underline hover:bg-bg-hover"
            >
              {t("pagination.next")} →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
