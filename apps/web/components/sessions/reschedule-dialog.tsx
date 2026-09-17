"use client";

import {
  RESCHEDULE_MAX_OPTIONS,
  RESCHEDULE_MIN_NOTICE_HOURS,
  type PublicAvailabilitySlot,
  type SessionResponse,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const HOUR = 3_600_000;
/** Mirrors RESCHEDULE_MAX_SHIFT_DAYS' default; the API is the authority. */
const MAX_SHIFT_DAYS = 30;

/** The coach's open slots that may be offered for this session. */
export function validRescheduleSlots(
  slots: PublicAvailabilitySlot[],
  session: Pick<SessionResponse, "startsAt" | "endsAt">,
  now: number,
): PublicAvailabilitySlot[] {
  const start = new Date(session.startsAt).getTime();
  const duration = new Date(session.endsAt).getTime() - start;
  return slots
    .filter((slot) => {
      const slotStart = new Date(slot.startsAt).getTime();
      return (
        new Date(slot.endsAt).getTime() - slotStart === duration &&
        slotStart - now >= RESCHEDULE_MIN_NOTICE_HOURS * HOUR &&
        Math.abs(slotStart - start) <= MAX_SHIFT_DAYS * 24 * HOUR &&
        slotStart !== start
      );
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * "Propose a new time": pick one to three of the coach's open slots (same
 * duration, far enough ahead) in the viewer's timezone. The offered slots are
 * held for the other party until they answer.
 */
export function RescheduleDialog({
  session,
  onClose,
  onProposed,
}: {
  session: SessionResponse;
  onClose: () => void;
  onProposed: () => void;
}) {
  const t = useTranslations("sessions.reschedule");
  const locale = useLocale();
  const [slots, setSlots] = useState<PublicAvailabilitySlot[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"load" | "taken" | "failed" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await apiFetch(`/pros/${session.coach.id}/slots`);
      if (cancelled) return;
      if (!response.ok) {
        setError("load");
        setSlots([]);
        return;
      }
      const all = (await response.json()) as PublicAvailabilitySlot[];
      setSlots(validRescheduleSlots(all, session, Date.now()));
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const days = useMemo(() => {
    const dayFormat = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const groups = new Map<string, PublicAvailabilitySlot[]>();
    for (const slot of slots ?? []) {
      const label = dayFormat.format(new Date(slot.startsAt));
      groups.set(label, [...(groups.get(label) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [slots, locale]);
  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
    [locale],
  );

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < RESCHEDULE_MAX_OPTIONS
          ? [...current, id]
          : current,
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const response = await apiFetch(`/sessions/${session.id}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ slotIds: picked }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.status === 409 ? "taken" : "failed");
      return;
    }
    onProposed();
  }

  return (
    <div
      role="group"
      aria-label={t("dialogTitle")}
      className="mt-3 rounded-lg border border-border bg-bg p-3 text-[13px]"
    >
      <div className="font-medium text-text">{t("dialogTitle")}</div>
      <p className="mt-0.5 text-text-secondary">
        {t("dialogHint", { max: RESCHEDULE_MAX_OPTIONS })}{" "}
        <span className="text-text-tertiary">{t("yourTime")}</span>
      </p>
      {slots === null ? (
        <div className="py-3 text-center text-text-tertiary">…</div>
      ) : days.length === 0 ? (
        <p className="mt-2 rounded-md bg-bg-secondary p-2.5 text-text-secondary">
          {error === "load" ? t("loadError") : t("noSlots")}
        </p>
      ) : (
        <div className="mt-2 max-h-[220px] space-y-2 overflow-y-auto">
          {days.map(([label, daySlots]) => (
            <div key={label}>
              <div className="text-[12px] font-medium text-text-tertiary">
                {label}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {daySlots.map((slot) => {
                  const active = picked.includes(slot.id);
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(slot.id)}
                      className={`cursor-pointer rounded-md border px-2.5 py-1.5 tabular-nums transition-colors ${
                        active
                          ? "border-[#2E7DE1] bg-[#EAF2FD] font-medium text-[#2A5FC7]"
                          : "border-border-strong text-text hover:bg-bg-hover"
                      }`}
                    >
                      {timeFormat.format(new Date(slot.startsAt))}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {error === "taken" ? (
        <p className="mt-2 text-[#C4554D]">{t("takenError")}</p>
      ) : error === "failed" ? (
        <p className="mt-2 text-[#C4554D]">{t("error")}</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={busy || picked.length === 0}
          onClick={() => void submit()}
        >
          {picked.length === 0
            ? t("proposeNone")
            : t("propose", { count: picked.length })}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          {t("back")}
        </Button>
      </div>
    </div>
  );
}
