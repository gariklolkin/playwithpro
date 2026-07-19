"use client";

import {
  BookingStatus,
  MeetingSyncStatus,
  VerificationState,
  type AdminBookingItem,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import {
  browserTimezone,
  dayKey,
  formatDay,
  formatTime,
} from "@/lib/timezones";

const STATE_STYLES: Partial<Record<VerificationState, string>> = {
  [VerificationState.Scheduled]: "bg-[#EAF2FD] text-[#2A5FC7]",
  [VerificationState.InProgress]: "bg-[#FDECC8] text-[#7A5A00]",
  [VerificationState.Verified]: "bg-[#DBEDDB] text-[#1C6B3C]",
  [VerificationState.Rejected]: "bg-[#FBE4E4] text-[#B33636]",
};

export function BookingsList({
  initialBookings,
}: {
  initialBookings: AdminBookingItem[];
}) {
  const t = useTranslations("adminScheduling.bookings");
  const locale = useLocale();
  const timezone = browserTimezone();
  const [items, setItems] = useState(initialBookings);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function refresh() {
    const response = await apiFetch("/admin/verification-bookings");
    if (response.ok) {
      setItems((await response.json()) as AdminBookingItem[]);
    }
  }

  async function act(item: AdminBookingItem, path: string, body?: object) {
    setBusy(item.bookingId);
    setErrors((current) => ({ ...current, [item.bookingId]: "" }));
    const response = await apiFetch(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(null);
    if (!response.ok) {
      setErrors((current) => ({ ...current, [item.bookingId]: t("error") }));
      return;
    }
    await refresh();
  }

  function reject(item: AdminBookingItem) {
    const note = window.prompt(t("rejectNotePrompt"));
    if (note === null) {
      return;
    }
    if (!note.trim()) {
      setErrors((current) => ({
        ...current,
        [item.bookingId]: t("noteRequired"),
      }));
      return;
    }
    void act(item, `/admin/verification-requests/${item.requestId}/reject`, {
      note: note.trim(),
    });
  }

  const today = dayKey(new Date().toISOString(), timezone);
  const active = items.filter(
    (item) => item.bookingStatus === BookingStatus.Scheduled,
  );
  const finished = items
    .filter((item) => item.bookingStatus !== BookingStatus.Scheduled)
    .reverse();

  if (items.length === 0) {
    return (
      <p className="rounded-card border border-border p-8 text-center text-sm text-text-secondary">
        {t("empty")}
      </p>
    );
  }

  return (
    <div>
      {[...active, ...finished].map((item) => {
        const isToday = dayKey(item.startsAt, timezone) === today;
        const isActive = item.bookingStatus === BookingStatus.Scheduled;
        return (
          <article
            key={item.bookingId}
            className={`mb-3 rounded-card bg-bg p-5 shadow-card ${isActive ? "" : "opacity-70"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-text">
                  {item.coach.displayName}
                </span>{" "}
                <span className="text-sm text-text-tertiary">
                  {item.coach.email}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isToday && isActive ? (
                  <span className="rounded bg-[#DBEDDB] px-2 py-0.5 text-[12px] font-semibold text-[#1C6B3C]">
                    {t("today")}
                  </span>
                ) : null}
                <span
                  className={`rounded px-2 py-0.5 text-[12px] font-medium ${STATE_STYLES[item.requestState] ?? "bg-bg-secondary text-text-secondary"}`}
                >
                  {t(`state.${item.requestState}`)}
                </span>
                {!isActive ? (
                  <span className="rounded bg-bg-secondary px-2 py-0.5 text-[12px] text-text-secondary">
                    {t(`outcome.${item.bookingStatus}`)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text">
              <span className="capitalize">
                {formatDay(item.startsAt, timezone, locale)} ·{" "}
                {formatTime(item.startsAt, timezone, locale)}–
                {formatTime(item.endsAt, timezone, locale)}
              </span>
              {item.meetUrl ? (
                <a
                  href={item.meetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#2A5FC7] underline"
                >
                  {t("join")}
                </a>
              ) : null}
              {item.syncStatus === MeetingSyncStatus.Failed && isActive ? (
                <span className="inline-flex items-center gap-2 rounded bg-[#FBE4E4] px-2 py-0.5 text-[12px] font-medium text-[#B33636]">
                  {t("syncFailed")}
                  <button
                    type="button"
                    disabled={busy === item.bookingId}
                    onClick={() =>
                      void act(
                        item,
                        `/admin/verification-bookings/${item.bookingId}/retry-sync`,
                      )
                    }
                    className="cursor-pointer underline"
                  >
                    {t("retry")}
                  </button>
                </span>
              ) : null}
              {item.noShowCount > 0 ? (
                <span className="text-[12px] text-text-tertiary">
                  {t("noShowCount", { count: item.noShowCount })}
                </span>
              ) : null}
            </div>

            {isActive ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {item.requestState === VerificationState.Scheduled ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="blueSoft"
                    disabled={busy === item.bookingId}
                    onClick={() =>
                      void act(
                        item,
                        `/admin/verification-bookings/${item.bookingId}/start`,
                      )
                    }
                  >
                    {t("start")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={busy === item.bookingId}
                  onClick={() =>
                    void act(
                      item,
                      `/admin/verification-requests/${item.requestId}/approve`,
                    )
                  }
                >
                  {t("approve")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy === item.bookingId}
                  onClick={() => reject(item)}
                >
                  {t("reject")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy === item.bookingId}
                  onClick={() => {
                    if (window.confirm(t("noShowConfirm"))) {
                      void act(
                        item,
                        `/admin/verification-bookings/${item.bookingId}/no-show`,
                      );
                    }
                  }}
                >
                  {t("noShow")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy === item.bookingId}
                  onClick={() => {
                    if (window.confirm(t("cancelConfirm"))) {
                      void act(
                        item,
                        `/admin/verification-bookings/${item.bookingId}/cancel`,
                      );
                    }
                  }}
                >
                  {t("cancel")}
                </Button>
                {errors[item.bookingId] ? (
                  <span className="text-[13px] text-[#E03E3E]">
                    {errors[item.bookingId]}
                  </span>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
