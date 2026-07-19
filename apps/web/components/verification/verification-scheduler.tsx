"use client";

import {
  BookingStatus,
  VerificationState,
  type ProProfileResponse,
  type VerificationSlotResponse,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { browserTimezone, formatDay, formatTime } from "@/lib/timezones";
import { SlotPicker } from "./slot-picker";

async function serverMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    return Array.isArray(body.message)
      ? body.message.join("; ")
      : (body.message ?? "");
  } catch {
    return "";
  }
}

/** The coach's Verification page: current status, slot picker, meeting card. */
export function VerificationScheduler({
  initialProfile,
  initialSlots,
}: {
  initialProfile: ProProfileResponse;
  initialSlots: VerificationSlotResponse[];
}) {
  const t = useTranslations("verification");
  const locale = useLocale();
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [slots, setSlots] = useState(initialSlots);
  const [timezone, setTimezone] = useState(browserTimezone);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const request = profile.latestVerification;
  const booking = request?.booking ?? null;

  async function refreshSlots() {
    const response = await apiFetch("/verification/slots");
    if (response.ok) {
      setSlots((await response.json()) as VerificationSlotResponse[]);
    }
  }

  async function act(
    path: string,
    options: {
      busySlot?: string;
      refreshOnConflict?: boolean;
      /** Booked/rescheduled: the profile card shows the result — go home. */
      goToProfile?: boolean;
    } = {},
  ): Promise<void> {
    setBusySlotId(options.busySlot ?? "-");
    setError("");
    const response = await apiFetch(path, {
      method: "POST",
      body: options.busySlot
        ? JSON.stringify({ slotId: options.busySlot })
        : undefined,
    });
    if (!response.ok) {
      setBusySlotId(null);
      setError((await serverMessage(response)) || t("error"));
      if (options.refreshOnConflict && response.status === 409) {
        void refreshSlots();
      }
      return;
    }
    if (options.goToProfile) {
      // Keep the pressed slot in its busy state during the transition.
      router.push("/dashboard/profile");
      router.refresh();
      return;
    }
    setBusySlotId(null);
    setProfile((await response.json()) as ProProfileResponse);
    void refreshSlots();
  }

  if (!request || request.state === VerificationState.Cancelled) {
    return (
      <EmptyCard
        text={t("notSubmitted")}
        cta={<LinkToProfile label={t("goToProfile")} />}
      />
    );
  }

  if (request.state === VerificationState.Verified) {
    return <EmptyCard text={t("verifiedInfo")} />;
  }

  if (request.state === VerificationState.Rejected) {
    return (
      <EmptyCard
        text={t("rejectedInfo", { note: request.adminNote })}
        cta={<LinkToProfile label={t("goToProfile")} />}
      />
    );
  }

  const errorLine = error ? (
    <p className="mb-4 text-[13px] text-[#E03E3E]">{error}</p>
  ) : null;

  // The way out when no slot fits (or none are open): drop the request.
  const withdrawLink = (
    <button
      type="button"
      disabled={busySlotId !== null}
      onClick={() => {
        if (window.confirm(t("withdrawConfirm"))) {
          void act("/verification/withdraw", { goToProfile: true });
        }
      }}
      className="mt-6 block cursor-pointer text-[13px] text-text-tertiary underline"
    >
      {t("withdraw")}
    </button>
  );

  if (request.state === VerificationState.AwaitingScheduling) {
    return (
      <div>
        {request.lastBookingOutcome === BookingStatus.NoShow ? (
          <Banner text={t("bannerNoShow")} />
        ) : null}
        {request.lastBookingOutcome === BookingStatus.CancelledByAdmin ? (
          <Banner text={t("bannerCancelledByAdmin")} />
        ) : null}
        <h2 className="mb-4 text-lg font-semibold text-text">
          {t("pickTitle")}
        </h2>
        {errorLine}
        <SlotPicker
          slots={slots}
          timezone={timezone}
          onTimezoneChange={setTimezone}
          busySlotId={busySlotId}
          onPick={(slotId) =>
            void act("/verification/bookings", {
              busySlot: slotId,
              refreshOnConflict: true,
              goToProfile: true,
            })
          }
        />
        {withdrawLink}
      </div>
    );
  }

  // scheduled / in_progress
  if (!booking) {
    return <EmptyCard text={t("error")} />;
  }

  // In progress, or locked inside the reschedule cutoff: nothing to change,
  // just show the meeting.
  if (
    request.state === VerificationState.InProgress ||
    !booking.canReschedule
  ) {
    return (
      <div className="max-w-[480px]">
        <div className="rounded-card bg-bg p-6 shadow-card">
          <p className="text-[13px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
            {request.state === VerificationState.InProgress
              ? t("inProgress")
              : t("scheduledTitle")}
          </p>
          <p className="mt-3 text-xl font-semibold capitalize text-text">
            {formatDay(booking.startsAt, timezone, locale)}
          </p>
          <p className="text-3xl font-bold text-text">
            {formatTime(booking.startsAt, timezone, locale)}
          </p>
          <p className="mt-1 text-[13px] text-text-tertiary">{timezone}</p>
          <div className="mt-5">
            {booking.meetUrl ? (
              <a
                href={booking.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg bg-[#2E7DE1] px-3.5 py-[9px] text-sm font-semibold text-white no-underline hover:bg-[#2569C3]"
              >
                🎥 {t("join")}
              </a>
            ) : (
              <span className="text-sm text-text-secondary">
                {t("linkPending")}
              </span>
            )}
          </div>
          {request.state === VerificationState.Scheduled ? (
            <p className="mt-4 text-[12px] text-text-tertiary">
              {t("cutoffLocked")}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // Scheduled and still changeable: straight into the picker — the current
  // time lives on the profile card, no need to repeat it as a screen.
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-text">
        {t("rescheduleTitle")}
      </h2>
      <p className="mb-4 text-sm capitalize text-text-secondary">
        {t("currentBooking", {
          day: formatDay(booking.startsAt, timezone, locale),
          time: formatTime(booking.startsAt, timezone, locale),
        })}
      </p>
      {errorLine}
      <SlotPicker
        slots={slots.filter((slot) => slot.startsAt !== booking.startsAt)}
        timezone={timezone}
        onTimezoneChange={setTimezone}
        busySlotId={busySlotId}
        onPick={(slotId) =>
          void act("/verification/bookings/reschedule", {
            busySlot: slotId,
            refreshOnConflict: true,
            goToProfile: true,
          })
        }
      />
      <Link
        href="/dashboard/profile"
        className="mt-4 inline-block text-sm text-text-secondary underline"
      >
        {t("keepTime")}
      </Link>
      {withdrawLink}
    </div>
  );
}

function EmptyCard({ text, cta }: { text: string; cta?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border p-10 text-center">
      <p className="text-sm text-text-secondary">{text}</p>
      {cta ? <div className="mt-4">{cta}</div> : null}
    </div>
  );
}

function LinkToProfile({ label }: { label: string }) {
  return (
    <Link
      href="/dashboard/profile"
      className="text-sm font-medium text-[#2A5FC7] underline"
    >
      {label}
    </Link>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <div className="mb-4 rounded-lg bg-[#FDECC8] px-4 py-2.5 text-[13.5px] text-[#402C1B]">
      {text}
    </div>
  );
}
