"use client";

import {
  SESSION_GOAL_MAX_LENGTH,
  ServiceType,
  SessionStatus,
  VideoStatus,
  type CancellationPolicy,
  type ProServiceResponse,
  type PublicAvailabilitySlot,
  type SessionListResponse,
  type SessionResponse,
  type SessionVideoInput,
  type VideoLimits,
  type VideoListResponse,
  type VideoResponse,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useMounted } from "@/components/catalog/local-time";
import { ClipPicker } from "@/components/sessions/clip-picker";
import { CancellationPolicySummary } from "./cancellation-policy";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { FUNNEL_EVENTS, track } from "@/lib/observability/analytics";
import { clipSetErrorMessage, clipSetStatus } from "@/lib/clip-set";
import { formatDuration } from "@/lib/format-duration";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";

type Viewer = "guest" | "amateur" | "other";

interface Props {
  proId: string;
  services: ProServiceResponse[];
  initialSlots: PublicAvailabilitySlot[];
  viewer: Viewer;
  /** The platform's current terms; null when they could not be loaded. */
  cancellationPolicy?: CancellationPolicy | null;
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

export function BookingPanel({
  proId,
  services,
  initialSlots,
  viewer,
  cancellationPolicy = null,
}: Props) {
  const t = useTranslations("coach.booking");
  const tClips = useTranslations("clips");
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
  const [limits, setLimits] = useState<VideoLimits | null>(null);
  const [clips, setClips] = useState<SessionVideoInput[]>([]);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The viewer's own unpaid booking with this coach: it holds a slot the
  // grid no longer shows, so it must be visible and releasable from here.
  const [pending, setPending] = useState<SessionResponse | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
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
      setLimits(library.limits);
    });
  }, [needsVideo, viewer, videos]);

  const clipStatus =
    videos && limits ? clipSetStatus(clips, videos, limits.session) : null;
  const clipTitles = new Map(videos?.map((video) => [video.id, video]) ?? []);

  useEffect(() => {
    if (viewer !== "amateur") return;
    void apiFetch("/sessions").then(async (response) => {
      if (!response.ok) return;
      const list = (await response.json()) as SessionListResponse;
      setPending(
        list.upcoming.find(
          (item) =>
            item.status === SessionStatus.PendingPayment &&
            item.coach.id === proId,
        ) ?? null,
      );
    });
  }, [viewer, proId]);

  // Minutes left tick once the banner is up; the API cancels at the deadline.
  useEffect(() => {
    if (!pending?.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [pending]);

  const minutesLeft = pending?.expiresAt
    ? Math.max(
        0,
        Math.ceil((new Date(pending.expiresAt).getTime() - now) / 60_000),
      )
    : 0;
  const pendingVisible = pending !== null && minutesLeft > 0;

  async function releasePending() {
    if (!pending) return;
    setReleasing(true);
    try {
      const response = await apiFetch(`/sessions/${pending.id}/cancel`, {
        method: "POST",
        body: "{}",
      });
      if (response.ok || response.status === 409) {
        setPending(null);
        await refreshSlots();
      }
    } finally {
      setReleasing(false);
    }
  }

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
          ...(needsVideo ? { videos: clips } : {}),
          ...(goal.trim() ? { goal: goal.trim() } : {}),
        }),
      });
      if (response.status === 409) {
        setError(t("slotTaken"));
        await refreshSlots();
        return;
      }
      if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        setError(clipSetErrorMessage(tClips, body, t("bookFailed")));
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
    (!needsVideo || (clipStatus !== null && !clipStatus.invalid)) &&
    !submitting;

  const panel = (
    <div className="rounded-card border border-border bg-bg p-5">
      <h2 className="text-lg font-semibold text-text">{t("title")}</h2>

      {pendingVisible && pending ? (
        <div className="mt-3 rounded-md bg-[#FBF3DB] p-3 text-[13px] text-[#8A5A00]">
          <p className="font-medium">
            {t("pending.title", {
              time: new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(pending.startsAt)),
            })}
          </p>
          <p className="mt-0.5">
            {t("pending.minutesLeft", { minutes: minutesLeft })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={`/booking/${pending.id}`}
              className="rounded-md bg-text px-2.5 py-1.5 text-[13px] font-medium text-white no-underline hover:bg-black"
            >
              {t("pending.pay")}
            </Link>
            <button
              type="button"
              disabled={releasing}
              onClick={() => void releasePending()}
              className="cursor-pointer rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] font-medium text-text hover:bg-bg-secondary disabled:opacity-60"
            >
              {releasing ? "…" : t("pending.release")}
            </button>
          </div>
        </div>
      ) : null}

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
                  onClick={() => {
                    setSlotId(slot.id);
                    track(FUNNEL_EVENTS.slotSelected, {
                      coachId: proId,
                      serviceType: serviceType ?? null,
                    });
                  }}
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
        {cancellationPolicy ? (
          <CancellationPolicySummary policy={cancellationPolicy} />
        ) : null}
      </div>

      {/* Step 3 — clips (video analysis only) */}
      {needsVideo && viewer === "amateur" ? (
        <div className="mt-4">
          <div className="mb-1.5 text-[13px] font-medium text-text-secondary">
            {t("attachVideo")}
          </div>
          {videos === null || limits === null ? (
            <div className="py-2 text-center text-sm text-text-tertiary">…</div>
          ) : (
            <ClipPicker
              videos={videos}
              caps={limits.session}
              value={clips}
              onChange={setClips}
            />
          )}
        </div>
      ) : null}

      {/* Goal — optional, all services */}
      {viewer === "amateur" ? (
        <div className="mt-4">
          <label
            htmlFor="booking-goal"
            className="mb-1.5 block text-[13px] font-medium text-text-secondary"
          >
            {t("goal.label")}
          </label>
          <textarea
            id="booking-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder={t("goal.placeholder")}
            rows={2}
            maxLength={SESSION_GOAL_MAX_LENGTH}
            data-ph-mask
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
          />
          <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px] text-text-tertiary">
            <span>{t("goal.hint")}</span>
            <span className="tabular-nums">
              {goal.length}/{SESSION_GOAL_MAX_LENGTH}
            </span>
          </div>
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
          {needsVideo && clips.length > 0 ? (
            <ol className="mt-2 space-y-0.5 text-[13px] text-text-secondary">
              {clips.map((clip, index) => {
                const video = clipTitles.get(clip.videoId);
                return (
                  <li key={clip.videoId} className="flex gap-1.5">
                    <span className="tabular-nums">{index + 1}.</span>
                    <span className="min-w-0 truncate">
                      {video?.title ?? clip.videoId}
                      {video?.durationSeconds !== null &&
                      video?.durationSeconds !== undefined
                        ? ` · ${formatDuration(video.durationSeconds)}`
                        : ""}
                      {clip.note ? ` — ${clip.note}` : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
          {goal.trim() ? (
            <p className="mt-2 text-[13px] text-text-secondary" data-ph-mask>
              🎯 {goal.trim()}
            </p>
          ) : null}
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
