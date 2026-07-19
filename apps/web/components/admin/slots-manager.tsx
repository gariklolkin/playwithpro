"use client";

import type { AdminSlotItem } from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import {
  browserTimezone,
  dayKey,
  formatDay,
  formatTime,
} from "@/lib/timezones";

const DURATIONS = [15, 20, 30];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Expands "date range + daily window + duration" into concrete slots in the
 * admin's browser timezone; the API only ever sees UTC instants.
 */
function expandSlots(input: {
  fromDate: string;
  toDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  skipWeekends: boolean;
}): Array<{ startsAt: string; endsAt: string }> {
  const slots: Array<{ startsAt: string; endsAt: string }> = [];
  const from = new Date(`${input.fromDate}T00:00:00`);
  const to = new Date(`${input.toDate}T00:00:00`);
  for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    if (input.skipWeekends && [0, 6].includes(day.getDay())) {
      continue;
    }
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const windowStart = new Date(`${date}T${input.startTime}:00`);
    const windowEnd = new Date(`${date}T${input.endTime}:00`);
    for (
      let start = new Date(windowStart);
      start < windowEnd;
      start = new Date(start.getTime() + input.durationMinutes * 60_000)
    ) {
      const end = new Date(start.getTime() + input.durationMinutes * 60_000);
      if (end > windowEnd) {
        break;
      }
      slots.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
    }
  }
  return slots;
}

export function SlotsManager({
  initialSlots,
}: {
  initialSlots: AdminSlotItem[];
}) {
  const t = useTranslations("adminScheduling.slots");
  const locale = useLocale();
  const timezone = browserTimezone();
  const [slots, setSlots] = useState(initialSlots);
  const [fromDate, setFromDate] = useState(todayIso);
  const [toDate, setToDate] = useState(todayIso);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [duration, setDuration] = useState(15);
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(
    () =>
      expandSlots({
        fromDate,
        toDate,
        startTime,
        endTime,
        durationMinutes: duration,
        skipWeekends,
      }),
    [fromDate, toDate, startTime, endTime, duration, skipWeekends],
  );

  async function publish() {
    if (preview.length === 0) {
      setError(t("nothingToPublish"));
      return;
    }
    setBusy(true);
    setError("");
    const response = await apiFetch("/admin/verification-slots", {
      method: "POST",
      body: JSON.stringify({ slots: preview }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(t("error"));
      return;
    }
    setSlots((await response.json()) as AdminSlotItem[]);
  }

  async function remove(slot: AdminSlotItem) {
    const force = slot.status === "booked";
    if (force && !window.confirm(t("removeBookedConfirm"))) {
      return;
    }
    setBusy(true);
    setError("");
    const response = await apiFetch(
      `/admin/verification-slots/${slot.id}${force ? "?force=true" : ""}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!response.ok) {
      setError(t("error"));
      return;
    }
    setSlots((await response.json()) as AdminSlotItem[]);
  }

  const days = useMemo(() => {
    const groups = new Map<string, AdminSlotItem[]>();
    for (const slot of slots) {
      const key = dayKey(slot.startsAt, timezone);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots, timezone]);

  return (
    <div>
      <section className="rounded-card bg-bg p-6 shadow-card">
        <h2 className="mb-1 text-[13px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
          {t("publishTitle")}
        </h2>
        <p className="mb-4 text-[12px] text-text-tertiary">
          {t("timezoneHint", { tz: timezone })}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label htmlFor="slots-from">{t("from")}</Label>
            <Input
              id="slots-from"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="slots-to">{t("to")}</Label>
            <Input
              id="slots-to"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="slots-start">{t("windowStart")}</Label>
            <Input
              id="slots-start"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="slots-end">{t("windowEnd")}</Label>
            <Input
              id="slots-end"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="slots-duration">{t("duration")}</Label>
            <select
              id="slots-duration"
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="w-full rounded-lg border border-border-strong bg-bg px-3 py-[9px] text-sm text-text"
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t("minutes", { minutes })}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-text">
              <input
                type="checkbox"
                checked={skipWeekends}
                onChange={(event) => setSkipWeekends(event.target.checked)}
              />
              {t("skipWeekends")}
            </label>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" disabled={busy} onClick={() => void publish()}>
            {t("publish", { count: preview.length })}
          </Button>
          {error ? (
            <span className="text-[13px] text-[#E03E3E]">{error}</span>
          ) : null}
        </div>
      </section>

      <section className="mt-6">
        {days.length === 0 ? (
          <p className="rounded-card border border-border p-8 text-center text-sm text-text-secondary">
            {t("empty")}
          </p>
        ) : (
          days.map(([key, daySlots]) => (
            <div key={key} className="mb-5">
              <h3 className="mb-2 text-sm font-semibold capitalize text-text">
                {formatDay(daySlots[0].startsAt, timezone, locale)}
              </h3>
              <div className="flex flex-wrap gap-2">
                {daySlots.map((slot) => (
                  <span
                    key={slot.id}
                    className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                      slot.status === "booked"
                        ? "border-[#F5C518]/40 bg-[#FDECC8] text-[#7A5A00]"
                        : "border-border bg-bg text-text"
                    }`}
                  >
                    {formatTime(slot.startsAt, timezone, locale)}
                    {slot.bookedBy ? (
                      <span
                        className="max-w-[160px] truncate text-[12px]"
                        title={slot.bookedBy.email}
                      >
                        {slot.bookedBy.displayName}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={t("remove")}
                      disabled={busy}
                      onClick={() => void remove(slot)}
                      className="cursor-pointer text-text-tertiary hover:text-[#E03E3E]"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
