"use client";

import type { VerificationSlotResponse } from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { allTimezones, dayKey, formatDay, formatTime } from "@/lib/timezones";

/**
 * Open slots grouped by day in the viewer's timezone. The active timezone is
 * always labeled and can be overridden.
 */
export function SlotPicker({
  slots,
  timezone,
  onTimezoneChange,
  busySlotId,
  onPick,
}: {
  slots: VerificationSlotResponse[];
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
  busySlotId: string | null;
  onPick: (slotId: string) => void;
}) {
  const t = useTranslations("verification");
  const locale = useLocale();
  const [pending, setPending] = useState<VerificationSlotResponse | null>(null);

  const days = useMemo(() => {
    const groups = new Map<string, VerificationSlotResponse[]>();
    for (const slot of slots) {
      const key = dayKey(slot.startsAt, timezone);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots, timezone]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-text-tertiary">
        <span>{t("timezoneLabel")}</span>
        <div className="w-[260px]">
          <TimezoneSelect
            id="verification-timezone"
            value={timezone}
            options={allTimezones()}
            onChange={onTimezoneChange}
          />
        </div>
      </div>

      {days.length === 0 ? (
        <p className="rounded-card border border-border p-6 text-center text-sm text-text-secondary">
          {t("noSlots")}
        </p>
      ) : (
        days.map(([key, daySlots]) => (
          <div key={key} className="mb-4">
            <h3 className="mb-2 text-sm font-semibold capitalize text-text">
              {formatDay(daySlots[0].startsAt, timezone, locale)}
            </h3>
            <div className="flex flex-wrap gap-2">
              {daySlots.map((slot) => {
                const selected = pending?.id === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={busySlotId !== null}
                    onClick={() => setPending(selected ? null : slot)}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:cursor-default disabled:opacity-60 ${
                      selected
                        ? "border-[#2E7DE1] bg-[#EAF2FD] font-medium text-[#2A5FC7]"
                        : "border-border-strong bg-bg text-text hover:border-[#2E7DE1]"
                    }`}
                  >
                    {formatTime(slot.startsAt, timezone, locale)}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      {pending ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-border bg-bg-secondary px-4 py-3 text-sm">
          <span className="text-text">
            {t("confirmSlot", {
              day: formatDay(pending.startsAt, timezone, locale),
              time: formatTime(pending.startsAt, timezone, locale),
            })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="blue"
            disabled={busySlotId !== null}
            onClick={() => onPick(pending.id)}
          >
            {busySlotId === pending.id ? t("booking") : t("confirm")}
          </Button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="cursor-pointer text-sm text-text-secondary underline"
          >
            {t("cancelAction")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
