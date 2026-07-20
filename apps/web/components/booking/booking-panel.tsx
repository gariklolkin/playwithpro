"use client";

import {
  ServiceType,
  VideoStatus,
  type ProServiceResponse,
  type PublicAvailabilitySlot,
  type SessionResponse,
  type VideoListResponse,
  type VideoResponse,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useMounted } from "@/components/catalog/local-time";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";

type Viewer = "guest" | "amateur" | "other";

interface Props {
  proId: string;
  services: ProServiceResponse[];
  initialSlots: PublicAvailabilitySlot[];
  viewer: Viewer;
}

/** Slots grouped by the viewer's local calendar day. */
function groupByDay(
  slots: PublicAvailabilitySlot[],
  locale: string,
): { dayKey: string; dayLabel: string; slots: PublicAvailabilitySlot[] }[] {
  const dayFormat = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const groups = new Map<
    string,
    { dayLabel: string; slots: PublicAvailabilitySlot[] }
  >();
  for (const slot of [...slots].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  )) {
    const date = new Date(slot.startsAt);
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const group = groups.get(dayKey) ?? {
      dayLabel: dayFormat.format(date),
      slots: [],
    };
    group.slots.push(slot);
    groups.set(dayKey, group);
  }
  return [...groups.entries()].map(([dayKey, group]) => ({ dayKey, ...group }));
}

export function BookingPanel({ proId, services, initialSlots, viewer }: Props) {
  const t = useTranslations("coach.booking");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [slots, setSlots] = useState(initialSlots);
  const [serviceType, setServiceType] = useState<ServiceType | null>(
    services[0]?.type ?? null,
  );
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoResponse[] | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Slots are grouped in the browser's timezone, so render after mount only.
  const mounted = useMounted();

  const service = services.find((item) => item.type === serviceType) ?? null;
  const needsVideo = serviceType === ServiceType.VideoAnalysis;
  const days = useMemo(
    () => (mounted ? groupByDay(slots, locale) : []),
    [slots, locale, mounted],
  );
  const activeDay =
    days.find((day) => day.dayKey === dayKey) ?? days[0] ?? null;
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: "short" }),
    [locale],
  );

  // The player's ready videos, loaded once video analysis is chosen.
  useEffect(() => {
    if (!needsVideo || viewer !== "amateur" || videos !== null) return;
    void apiFetch("/videos").then(async (response) => {
      if (!response.ok) return;
      const library = (await response.json()) as VideoListResponse;
      setVideos(
        library.videos.filter((video) => video.status === VideoStatus.Ready),
      );
    });
  }, [needsVideo, viewer, videos]);

  async function refreshSlots() {
    const response = await apiFetch(`/pros/${proId}/slots`);
    if (response.ok) {
      setSlots((await response.json()) as PublicAvailabilitySlot[]);
      setSlotId(null);
    }
  }

  async function book() {
    if (!serviceType || !slotId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiFetch("/bookings", {
        method: "POST",
        body: JSON.stringify({
          proId,
          serviceType,
          slotId,
          ...(needsVideo && videoId ? { videoId } : {}),
        }),
      });
      if (response.status === 409) {
        setError(t("slotTaken"));
        await refreshSlots();
        return;
      }
      if (!response.ok) {
        setError(t("bookFailed"));
        return;
      }
      const session = (await response.json()) as SessionResponse;
      router.push(`/booking/${session.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  const canBook =
    viewer === "amateur" &&
    service !== null &&
    slotId !== null &&
    (!needsVideo || videoId !== null) &&
    !submitting;

  const panel = (
    <div className="rounded-card border border-border bg-bg p-5">
      <h2 className="text-lg font-semibold text-text">{t("title")}</h2>

      {/* Step 1 — service */}
      <div className="mt-4">
        <div className="mb-1.5 text-[13px] font-medium text-text-secondary">
          {t("chooseService")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {services.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => {
                setServiceType(item.type);
                setError(null);
              }}
              className={`rounded-md border px-2.5 py-1.5 text-[13px] transition-colors ${
                item.type === serviceType
                  ? "border-text bg-text text-white"
                  : "border-border-strong text-text hover:bg-bg-hover"
              }`}
            >
              {t(`serviceShort.${item.type}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 — slot */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-text-secondary">
            {t("chooseSlot")}
          </span>
          <span className="text-[11px] text-text-tertiary">
            {t("yourTime")}
          </span>
        </div>
        {!mounted ? (
          <div className="py-4 text-center text-sm text-text-tertiary">…</div>
        ) : days.length === 0 ? (
          <p className="rounded-md bg-bg-secondary p-3 text-[13px] text-text-secondary">
            {t("noSlots")}
          </p>
        ) : (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {days.map((day) => (
                <button
                  key={day.dayKey}
                  type="button"
                  onClick={() => {
                    setDayKey(day.dayKey);
                    setSlotId(null);
                  }}
                  className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors ${
                    day.dayKey === activeDay?.dayKey
                      ? "border-text bg-text text-white"
                      : "border-border-strong text-text hover:bg-bg-hover"
                  }`}
                >
                  {day.dayLabel}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeDay?.slots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSlotId(slot.id)}
                  className={`rounded-md border px-2.5 py-1.5 text-[13px] tabular-nums transition-colors ${
                    slot.id === slotId
                      ? "border-[#2E7DE1] bg-[#EAF2FD] font-medium text-[#2A5FC7]"
                      : "border-border-strong text-text hover:bg-bg-hover"
                  }`}
                >
                  {timeFormat.format(new Date(slot.startsAt))}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Step 3 — video (video analysis only) */}
      {needsVideo && viewer === "amateur" ? (
        <div className="mt-4">
          <div className="mb-1.5 text-[13px] font-medium text-text-secondary">
            {t("attachVideo")}
          </div>
          {videos === null ? (
            <div className="py-2 text-center text-sm text-text-tertiary">…</div>
          ) : videos.length === 0 ? (
            <p className="rounded-md bg-bg-secondary p-3 text-[13px] text-text-secondary">
              {t("noVideos")}{" "}
              <Link
                href="/dashboard/videos/upload"
                className="font-medium text-[#2A5FC7] hover:underline"
              >
                {t("uploadCta")}
              </Link>
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {videos.map((video) => (
                <li key={video.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text hover:bg-bg-hover">
                    <input
                      type="radio"
                      name="booking-video"
                      checked={videoId === video.id}
                      onChange={() => setVideoId(video.id)}
                    />
                    <span className="truncate">📹 {video.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Summary */}
      {service ? (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">{t("price")}</span>
            <span className="font-semibold text-text">
              {formatMoney(service.priceMinor, service.currency, locale)}
            </span>
          </div>
          <p className="mt-2 rounded-md bg-[#EAF2FD] p-2.5 text-[12px] leading-snug text-[#2A5FC7]">
            🔒 {t("escrowNotice")}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md bg-[#FBE4E4] p-2.5 text-[13px] text-[#C4554D]">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        {viewer === "guest" ? (
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className="block rounded-lg bg-text px-3.5 py-2.5 text-center text-sm font-medium text-white no-underline hover:bg-black"
          >
            {t("loginCta")}
          </Link>
        ) : viewer === "other" ? (
          <p className="text-center text-[13px] text-text-tertiary">
            {t("coachesCannotBook")}
          </p>
        ) : (
          <Button size="full" disabled={!canBook} onClick={() => void book()}>
            {submitting ? "…" : t("bookCta")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: sticky side panel */}
      <aside className="hidden min-[900px]:block">
        <div className="sticky top-6">{panel}</div>
      </aside>

      {/* Mobile: bottom sheet */}
      <div className="min-[900px]:hidden">
        {sheetOpen ? (
          <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/30">
            <div className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-bg p-4 pb-6 shadow-2xl">
              <button
                type="button"
                className="mb-2 w-full text-center text-[13px] text-text-secondary"
                onClick={() => setSheetOpen(false)}
              >
                ▾ {t("close")}
              </button>
              {panel}
            </div>
          </div>
        ) : (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
            <Button size="full" onClick={() => setSheetOpen(true)}>
              {t("openSheet")}
              {service
                ? ` · ${formatMoney(service.priceMinor, service.currency, locale)}`
                : null}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
