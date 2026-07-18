"use client";

import type { AdminVerificationItem } from "@playwithpro/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

function formatPrice(priceMinor: number, currency: string): string {
  return `${(priceMinor / 100).toFixed(2)} ${currency}`;
}

export function VerificationQueue({
  initialItems,
}: {
  initialItems: AdminVerificationItem[];
}) {
  const t = useTranslations("adminVerification");
  const format = useFormatter();
  const [items, setItems] = useState(initialItems);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [callRequested, setCallRequested] = useState<Record<string, boolean>>(
    {},
  );

  async function requestCall(item: AdminVerificationItem) {
    setBusy(item.requestId);
    setErrors((current) => ({ ...current, [item.requestId]: "" }));
    const response = await apiFetch(
      `/admin/verification-requests/${item.requestId}/call`,
      { method: "POST" },
    );
    setBusy(null);
    if (!response.ok) {
      setErrors((current) => ({ ...current, [item.requestId]: t("error") }));
      return;
    }
    setCallRequested((current) => ({ ...current, [item.requestId]: true }));
  }

  async function review(
    item: AdminVerificationItem,
    action: "approve" | "reject",
  ) {
    const note = (notes[item.requestId] ?? "").trim();
    if (action === "reject" && !note) {
      setErrors((current) => ({
        ...current,
        [item.requestId]: t("noteRequired"),
      }));
      return;
    }
    setBusy(item.requestId);
    setErrors((current) => ({ ...current, [item.requestId]: "" }));
    const response = await apiFetch(
      `/admin/verification-requests/${item.requestId}/${action}`,
      {
        method: "POST",
        body: action === "reject" ? JSON.stringify({ note }) : undefined,
      },
    );
    setBusy(null);
    if (!response.ok) {
      setErrors((current) => ({
        ...current,
        [item.requestId]: t("error"),
      }));
      return;
    }
    setItems((current) =>
      current.filter((queued) => queued.requestId !== item.requestId),
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-border p-10 text-center">
        <div className="text-3xl">✅</div>
        <p className="mt-2 text-sm text-text-secondary">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {items.map((item) => (
        <article
          key={item.requestId}
          className="mb-4 rounded-card bg-bg p-6 shadow-card"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="font-semibold text-text">
                {item.user.displayName}
              </span>{" "}
              <span className="text-sm text-text-tertiary">
                {item.user.email}
              </span>
            </div>
            <span className="text-[13px] text-text-tertiary">
              {t("submitted", {
                date: format.dateTime(new Date(item.submittedAt), {
                  dateStyle: "medium",
                }),
              })}
            </span>
          </header>

          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-tertiary">{t("bio")}</dt>
              <dd className="whitespace-pre-wrap text-text">
                {item.profile.bio}
              </dd>
            </div>
            <div>
              <dt className="text-text-tertiary">{t("credentials")}</dt>
              <dd className="whitespace-pre-wrap text-text">
                {item.credentials}
              </dd>
            </div>
            <div>
              <dt className="text-text-tertiary">{t("contact")}</dt>
              <dd className="text-text">{item.contact || "—"}</dd>
            </div>
            <div>
              <dt className="text-text-tertiary">{t("languages")}</dt>
              <dd className="text-text">
                {item.profile.languages
                  .map(
                    (code) =>
                      LOCALE_LABELS[code as keyof typeof LOCALE_LABELS] ?? code,
                  )
                  .join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-tertiary">{t("services")}</dt>
              <dd className="text-text">
                {item.profile.services
                  .filter((service) => service.active)
                  .map(
                    (service) =>
                      `${service.type}: ${formatPrice(service.priceMinor, service.currency)}/h`,
                  )
                  .join(" · ") || "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-border pt-4">
            <textarea
              rows={2}
              placeholder={t("notePlaceholder")}
              value={notes[item.requestId] ?? ""}
              onChange={(event) =>
                setNotes((current) => ({
                  ...current,
                  [item.requestId]: event.target.value,
                }))
              }
              className="mb-3 w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="blueSoft"
                disabled={
                  busy === item.requestId ||
                  Boolean(item.callRequestedAt) ||
                  callRequested[item.requestId]
                }
                onClick={() => void requestCall(item)}
              >
                {Boolean(item.callRequestedAt) || callRequested[item.requestId]
                  ? t("callRequested")
                  : t("requestCall")}
              </Button>
              <Button
                type="button"
                disabled={busy === item.requestId}
                onClick={() => void review(item, "approve")}
              >
                {t("approve")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy === item.requestId}
                onClick={() => void review(item, "reject")}
              >
                {t("reject")}
              </Button>
              {errors[item.requestId] ? (
                <span className="text-[13px] text-[#E03E3E]">
                  {errors[item.requestId]}
                </span>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
