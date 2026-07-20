"use client";

import type {
  AvailabilityRuleInput,
  AvailabilitySlotItem,
  CoachAvailabilityResponse,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { dayKey, formatDay, formatTime } from "@/lib/timezones";
import { wallClockToUtc } from "@/lib/wall-clock";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const SLOT_MINUTES = 60;
/** Hour toggles offered in the day editor; existing slots outside are shown too. */
const DAY_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 … 22:00
const START_OPTIONS = Array.from({ length: 47 }, (_, i) => i * 30).filter(
  (m) => m + SLOT_MINUTES <= 24 * 60,
);
const END_OPTIONS = Array.from({ length: 47 }, (_, i) => (i + 2) * 30).filter(
  (m) => m <= 24 * 60,
);

function minuteLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Localized Monday-first weekday names (2024-01-01 is a Monday). */
function weekdayNames(
  locale: string,
  style: "long" | "short" = "long",
): string[] {
  const format = new Intl.DateTimeFormat(locale, {
    weekday: style,
    timeZone: "UTC",
  });
  return WEEKDAYS.map((day) =>
    format.format(new Date(Date.UTC(2024, 0, 1 + day))),
  );
}

function sortedRules(rules: AvailabilityRuleInput[]): AvailabilityRuleInput[] {
  return rules
    .map(({ weekday, startMinute, endMinute }) => ({
      weekday,
      startMinute,
      endMinute,
    }))
    .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

function sameRules(
  a: AvailabilityRuleInput[],
  b: AvailabilityRuleInput[],
): boolean {
  return JSON.stringify(sortedRules(a)) === JSON.stringify(sortedRules(b));
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    return Array.isArray(body.message)
      ? body.message.join("; ")
      : (body.message ?? "");
  } catch {
    return "";
  }
}

interface CalendarDay {
  key: string; // YYYY-MM-DD
  year: number;
  month: number; // 1-12
  day: number;
}

/** Monday-first month grid; leading/trailing nulls pad the first/last week. */
function monthGrid(year: number, month: number): Array<CalendarDay | null> {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<CalendarDay | null> = Array.from(
    { length: lead },
    () => null,
  );
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      year,
      month,
      day,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function AvailabilityEditor({
  initialData,
}: {
  initialData: CoachAvailabilityResponse;
}) {
  const t = useTranslations("availability");
  const locale = useLocale();
  const [data, setData] = useState(initialData);
  const [rules, setRules] = useState<AvailabilityRuleInput[]>(
    sortedRules(initialData.rules),
  );
  const [tab, setTab] = useState<"calendar" | "template">("calendar");
  const [templateStatus, setTemplateStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [templateError, setTemplateError] = useState("");

  const timezone = data.timezone;
  // "Now" is sampled once per mount — enough for past-day/past-hour guards.
  const [nowIso] = useState(() => new Date().toISOString());
  const todayKey = dayKey(nowIso, timezone);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dayStatus, setDayStatus] = useState<"idle" | "busy" | "error">("idle");
  const [dayError, setDayError] = useState("");

  const names = useMemo(() => weekdayNames(locale), [locale]);
  const shortNames = useMemo(() => weekdayNames(locale, "short"), [locale]);
  const dirty = !sameRules(rules, data.rules);

  const slotsByDay = useMemo(() => {
    const groups = new Map<string, AvailabilitySlotItem[]>();
    for (const slot of data.slots) {
      const key = dayKey(slot.startsAt, timezone);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return groups;
  }, [data.slots, timezone]);

  // The displayed month, anchored to today in the coach's timezone.
  const [ty, tm] = todayKey.split("-").map(Number);
  const shownTotal = ty * 12 + (tm - 1) + monthOffset;
  const shownYear = Math.floor(shownTotal / 12);
  const shownMonth = (shownTotal % 12) + 1;
  const cells = monthGrid(shownYear, shownMonth);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(shownYear, shownMonth - 1, 1));

  const selectedSlots = selectedKey ? (slotsByDay.get(selectedKey) ?? []) : [];

  function patchRule(index: number, patch: Partial<AvailabilityRuleInput>) {
    setRules((current) =>
      current.map((rule, i) => {
        if (i !== index) {
          return rule;
        }
        const next = { ...rule, ...patch };
        // Keep the window valid: a slot must always fit into it.
        if (next.endMinute - next.startMinute < SLOT_MINUTES) {
          next.endMinute = Math.min(next.startMinute + SLOT_MINUTES, 24 * 60);
        }
        return next;
      }),
    );
  }

  async function handleTemplateSave(event: React.FormEvent) {
    event.preventDefault();
    setTemplateStatus("saving");
    setTemplateError("");
    const response = await apiFetch("/pros/me/availability/rules", {
      method: "PUT",
      body: JSON.stringify({ rules: sortedRules(rules) }),
    });
    if (!response.ok) {
      setTemplateStatus("error");
      setTemplateError(await errorMessage(response));
      return;
    }
    const next = (await response.json()) as CoachAvailabilityResponse;
    setData(next);
    setRules(sortedRules(next.rules));
    setTemplateStatus("idle");
  }

  /** One tap on an hour: open slot → remove it; free hour → open a slot. */
  async function applySlotChange(request: Promise<Response>) {
    setDayStatus("busy");
    setDayError("");
    const response = await request;
    if (!response.ok) {
      setDayStatus("error");
      setDayError(await errorMessage(response));
      return;
    }
    setData((await response.json()) as CoachAvailabilityResponse);
    setDayStatus("idle");
  }

  async function toggleHour(day: CalendarDay, hour: number) {
    const startsAt = wallClockToUtc(
      timezone,
      day.year,
      day.month,
      day.day,
      hour * 60,
    ).toISOString();
    const existing = selectedSlots.find((slot) => slot.startsAt === startsAt);
    await applySlotChange(
      existing
        ? apiFetch(`/pros/me/availability/slots/${existing.id}`, {
            method: "DELETE",
          })
        : apiFetch("/pros/me/availability/slots", {
            method: "POST",
            body: JSON.stringify({ startsAt }),
          }),
    );
  }

  async function removeSlot(slot: AvailabilitySlotItem) {
    await applySlotChange(
      apiFetch(`/pros/me/availability/slots/${slot.id}`, { method: "DELETE" }),
    );
  }

  const selectedDay: CalendarDay | null = selectedKey
    ? (() => {
        const [y, m, d] = selectedKey.split("-").map(Number);
        return {
          key: selectedKey,
          year: y,
          month: m,
          day: d,
        };
      })()
    : null;
  const selectedDate = selectedDay
    ? new Date(
        Date.UTC(selectedDay.year, selectedDay.month - 1, selectedDay.day, 12),
      )
    : null;

  const tabClass = (active: boolean) =>
    `cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-black/5 text-text"
        : "text-text-secondary hover:bg-black/5 hover:text-text"
    }`;

  return (
    <section className="mt-6 rounded-card bg-bg p-6 shadow-card">
      {/* Mode switcher: ad-hoc calendar editing vs the recurring template */}
      <div
        role="tablist"
        className="mb-1 flex gap-1 border-b border-border pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "calendar"}
          onClick={() => setTab("calendar")}
          className={tabClass(tab === "calendar")}
        >
          🗓️ {t("calendar.title")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "template"}
          onClick={() => setTab("template")}
          className={tabClass(tab === "template")}
        >
          ⚡ {t("template.title")}
        </button>
      </div>

      {tab === "calendar" ? (
        <div>
          <p className="mb-4 mt-3 text-[12px] text-text-tertiary">
            {t("calendar.hint", { timezone })}
          </p>

          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label={t("calendar.prevMonth")}
              disabled={monthOffset === 0}
              onClick={() => setMonthOffset((v) => v - 1)}
              className="cursor-pointer rounded-lg border border-border px-2.5 py-1 text-sm text-text disabled:cursor-default disabled:opacity-40"
            >
              ←
            </button>
            <span className="text-sm font-semibold capitalize text-text">
              {monthLabel}
            </span>
            <button
              type="button"
              aria-label={t("calendar.nextMonth")}
              disabled={monthOffset >= 2}
              onClick={() => setMonthOffset((v) => v + 1)}
              className="cursor-pointer rounded-lg border border-border px-2.5 py-1 text-sm text-text disabled:cursor-default disabled:opacity-40"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {shortNames.map((name) => (
              <div
                key={name}
                className="pb-1 text-center text-[11px] font-medium uppercase text-text-tertiary"
              >
                {name}
              </div>
            ))}
            {cells.map((cell, index) => {
              if (!cell) {
                return <div key={`pad-${index}`} />;
              }
              const daySlots = slotsByDay.get(cell.key) ?? [];
              const open = daySlots.filter((s) => s.status === "open").length;
              const booked = daySlots.length - open;
              const past = cell.key < todayKey;
              const selected = cell.key === selectedKey;
              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={past}
                  aria-label={`${cell.key}${open ? ` · ${open}` : ""}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedKey(selected ? null : cell.key);
                    setDayStatus("idle");
                    setDayError("");
                  }}
                  className={`flex min-h-[52px] cursor-pointer flex-col items-center rounded-lg border p-1 text-sm transition-colors disabled:cursor-default disabled:opacity-35 ${
                    selected
                      ? "border-[#2E7DE1] bg-[#EAF2FD]"
                      : cell.key === todayKey
                        ? "border-border-strong bg-bg-secondary"
                        : "border-border bg-bg hover:border-[#2E7DE1]"
                  }`}
                >
                  <span
                    className={
                      selected ? "font-semibold text-[#2A5FC7]" : "text-text"
                    }
                  >
                    {cell.day}
                  </span>
                  {daySlots.length > 0 ? (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px]">
                      {open > 0 ? (
                        <span className="rounded bg-[#DBEDDB] px-1 text-[#1C6B3C]">
                          {open}
                        </span>
                      ) : null}
                      {booked > 0 ? (
                        <span className="rounded bg-[#FDECC8] px-1 text-[#7A5A00]">
                          {booked}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Day editor */}
          {selectedDay && selectedDate ? (
            <div className="mt-5 rounded-card border border-border bg-bg-secondary p-4">
              <h3 className="text-sm font-semibold capitalize text-text">
                {formatDay(selectedDate.toISOString(), "UTC", locale)}
              </h3>
              <p className="mb-3 mt-0.5 text-[12px] text-text-tertiary">
                {t("day.hint")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DAY_HOURS.map((hour) => {
                  const startsAt = wallClockToUtc(
                    timezone,
                    selectedDay.year,
                    selectedDay.month,
                    selectedDay.day,
                    hour * 60,
                  ).toISOString();
                  const slot = selectedSlots.find(
                    (s) => s.startsAt === startsAt,
                  );
                  // ISO strings compare chronologically.
                  const isPast = startsAt <= nowIso;
                  if (slot?.status === "booked") {
                    return (
                      <span
                        key={hour}
                        className="rounded-lg bg-[#FDECC8] px-2.5 py-1.5 text-sm text-[#7A5A00]"
                      >
                        {minuteLabel(hour * 60)} · {t("day.booked")}
                      </span>
                    );
                  }
                  return (
                    <button
                      key={hour}
                      type="button"
                      disabled={dayStatus === "busy" || (isPast && !slot)}
                      aria-pressed={Boolean(slot)}
                      onClick={() => void toggleHour(selectedDay, hour)}
                      className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-sm transition-colors disabled:cursor-default disabled:opacity-40 ${
                        slot
                          ? "border-[#1C6B3C] bg-[#DBEDDB] font-medium text-[#1C6B3C]"
                          : "border-border-strong bg-bg text-text hover:border-[#1C6B3C]"
                      }`}
                    >
                      {minuteLabel(hour * 60)}
                    </button>
                  );
                })}
                {/* Slots outside the standard grid (e.g. late night or :30 starts) */}
                {selectedSlots
                  .filter((slot) => {
                    const [h, m] = formatTime(slot.startsAt, timezone, "en")
                      .split(":")
                      .map(Number);
                    return (
                      m !== 0 ||
                      h < DAY_HOURS[0] ||
                      h > DAY_HOURS[DAY_HOURS.length - 1]
                    );
                  })
                  .map((slot) =>
                    slot.status === "booked" ? (
                      <span
                        key={slot.id}
                        className="rounded-lg bg-[#FDECC8] px-2.5 py-1.5 text-sm text-[#7A5A00]"
                      >
                        {formatTime(slot.startsAt, timezone, locale)} ·{" "}
                        {t("day.booked")}
                      </span>
                    ) : (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={dayStatus === "busy"}
                        aria-pressed
                        onClick={() => void removeSlot(slot)}
                        className="cursor-pointer rounded-lg border border-[#1C6B3C] bg-[#DBEDDB] px-2.5 py-1.5 text-sm font-medium text-[#1C6B3C] disabled:cursor-default disabled:opacity-40"
                      >
                        {formatTime(slot.startsAt, timezone, locale)}
                      </button>
                    ),
                  )}
              </div>
              {dayStatus === "error" ? (
                <p className="mt-2 text-[13px] text-[#E03E3E]">
                  {dayError || t("day.error")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-5 text-center text-sm text-text-secondary">
              {t("day.pickPrompt")}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleTemplateSave} noValidate className="mt-3">
          <p className="mb-1 text-[12px] text-text-tertiary">
            {t("template.toggle")}
          </p>
          <p className="mb-4 text-[12px] text-text-tertiary">
            {t("template.hint", { timezone })}
          </p>
          {WEEKDAYS.map((weekday) => {
            const windows = rules
              .map((rule, index) => ({ rule, index }))
              .filter(({ rule }) => rule.weekday === weekday);
            return (
              <div
                key={weekday}
                className="flex flex-wrap items-start gap-3 border-b border-border py-2.5 last:border-b-0"
              >
                <span className="w-28 pt-1.5 text-sm font-medium capitalize text-text">
                  {names[weekday]}
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  {windows.length === 0 ? (
                    <span className="pt-1.5 text-sm text-text-tertiary">
                      {t("template.dayOff")}
                    </span>
                  ) : (
                    windows.map(({ rule, index }) => (
                      <div key={index} className="flex items-center gap-2">
                        <select
                          aria-label={t("template.from")}
                          value={rule.startMinute}
                          onChange={(event) =>
                            patchRule(index, {
                              startMinute: Number(event.target.value),
                            })
                          }
                          className="rounded-lg border border-border-strong bg-bg px-2 py-1.5 text-sm text-text"
                        >
                          {START_OPTIONS.map((minute) => (
                            <option key={minute} value={minute}>
                              {minuteLabel(minute)}
                            </option>
                          ))}
                        </select>
                        <span className="text-text-tertiary">–</span>
                        <select
                          aria-label={t("template.to")}
                          value={rule.endMinute}
                          onChange={(event) =>
                            patchRule(index, {
                              endMinute: Number(event.target.value),
                            })
                          }
                          className="rounded-lg border border-border-strong bg-bg px-2 py-1.5 text-sm text-text"
                        >
                          {END_OPTIONS.filter(
                            (minute) =>
                              minute - rule.startMinute >= SLOT_MINUTES,
                          ).map((minute) => (
                            <option key={minute} value={minute}>
                              {minuteLabel(minute)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          aria-label={t("template.removeWindow")}
                          onClick={() =>
                            setRules((current) =>
                              current.filter((_, i) => i !== index),
                            )
                          }
                          className="cursor-pointer rounded px-1 text-text-tertiary hover:text-[#B33636]"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRules((current) => [
                      ...current,
                      { weekday, startMinute: 18 * 60, endMinute: 20 * 60 },
                    ])
                  }
                  className="cursor-pointer pt-1.5 text-sm font-medium text-[#2A5FC7] hover:underline"
                >
                  + {t("template.addWindow")}
                </button>
              </div>
            );
          })}
          <div className="mt-4 flex items-center gap-3">
            <Button
              type="submit"
              disabled={templateStatus === "saving" || !dirty}
            >
              {templateStatus === "saving"
                ? t("template.saving")
                : t("template.save")}
            </Button>
            {templateStatus === "error" ? (
              <span className="text-[13px] text-[#E03E3E]">
                {templateError || t("template.error")}
              </span>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
