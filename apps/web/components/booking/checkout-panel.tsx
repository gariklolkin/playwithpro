"use client";

import {
  MOCK_DECLINE_INSTRUMENT,
  SessionStatus,
  type PaySessionResponse,
  type SessionResponse,
} from "@playwithpro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LocalTime } from "@/components/catalog/local-time";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";

function remainingSeconds(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  return Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
}

export function CheckoutPanel({
  initialSession,
}: {
  initialSession: SessionResponse;
}) {
  const t = useTranslations("checkout");
  const tCatalog = useTranslations("catalog");
  const locale = useLocale();
  const router = useRouter();

  const [session, setSession] = useState(initialSession);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    remainingSeconds(initialSession.expiresAt),
  );
  const [paying, setPaying] = useState(false);
  const [declined, setDeclined] = useState<string | null>(null);
  const [paid, setPaid] = useState(
    initialSession.status === SessionStatus.PaidEscrow,
  );
  const [simulateDecline, setSimulateDecline] = useState(false);

  const pending = session.status === SessionStatus.PendingPayment;
  const expired = pending && session.expiresAt !== null && secondsLeft === 0;

  useEffect(() => {
    if (!pending || paid) return;
    const timer = setInterval(
      () => setSecondsLeft(remainingSeconds(session.expiresAt)),
      1000,
    );
    return () => clearInterval(timer);
  }, [pending, paid, session.expiresAt]);

  async function pay() {
    setPaying(true);
    setDeclined(null);
    try {
      const response = await apiFetch(`/sessions/${session.id}/pay`, {
        method: "POST",
        body: JSON.stringify(
          simulateDecline ? { instrument: MOCK_DECLINE_INSTRUMENT } : {},
        ),
      });
      if (response.status === 409) {
        // Late payment: the API cancelled the session and released the slot.
        setSecondsLeft(0);
        setSession((current) => ({
          ...current,
          status: SessionStatus.Cancelled,
        }));
        return;
      }
      if (!response.ok) {
        setDeclined(t("payFailed"));
        return;
      }
      const result = (await response.json()) as PaySessionResponse;
      setSession(result.session);
      if (result.paymentStatus === "held") {
        setPaid(true);
      } else {
        setDeclined(
          result.declineReason === "card_declined"
            ? t("declined.card_declined")
            : t("payFailed"),
        );
      }
    } finally {
      setPaying(false);
    }
  }

  if (paid) {
    return (
      <div className="mt-16 rounded-card border border-border p-10 text-center">
        <div className="text-4xl">✅</div>
        <h1 className="mt-3 text-xl font-bold text-text">{t("paidTitle")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("paidSubtitle")}</p>
        <Button
          className="mt-6"
          onClick={() => router.push("/dashboard/sessions")}
        >
          {t("goToSessions")}
        </Button>
      </div>
    );
  }

  if (expired || session.status === SessionStatus.Cancelled) {
    return (
      <div className="mt-16 rounded-card border border-border p-10 text-center">
        <div className="text-4xl">⌛</div>
        <h1 className="mt-3 text-xl font-bold text-text">
          {t("expiredTitle")}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t("expiredSubtitle")}
        </p>
        <Link
          href={`/coaches/${session.coach.id}`}
          className="mt-6 inline-block rounded-lg bg-text px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-black"
        >
          {t("backToCoach")}
        </Link>
      </div>
    );
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="pt-12">
      <h1 className="text-[26px] font-bold text-text">💳 {t("title")}</h1>

      <section className="mt-6 rounded-card border border-border p-5">
        <h2 className="text-sm font-semibold text-text-secondary">
          {t("orderSummary")}
        </h2>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">{t("coach")}</dt>
            <dd className="font-medium text-text">
              {session.coach.displayName}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">{t("service")}</dt>
            <dd className="font-medium text-text">
              {tCatalog(`service.${session.serviceType}`)}
            </dd>
          </div>
          {session.videoTitle ? (
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">{t("video")}</dt>
              <dd className="max-w-[60%] truncate font-medium text-text">
                📹 {session.videoTitle}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">{t("dateTime")}</dt>
            <dd className="font-medium text-text">
              <LocalTime iso={session.startsAt} />{" "}
              <span className="font-normal text-text-tertiary">
                {t("yourTime")}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-2.5 text-base">
            <dt className="font-semibold text-text">{t("total")}</dt>
            <dd className="font-bold text-text">
              {formatMoney(session.priceMinor, session.currency, locale)}
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-4 rounded-md bg-[#EAF2FD] p-3 text-[13px] leading-snug text-[#2A5FC7]">
        🔒 {t("escrowNotice")}
      </p>

      {declined ? (
        <p className="mt-3 rounded-md bg-[#FBE4E4] p-3 text-[13px] text-[#C4554D]">
          {declined}
        </p>
      ) : null}

      <Button
        size="full"
        className="mt-5"
        disabled={paying}
        onClick={() => void pay()}
      >
        {paying
          ? "…"
          : t("payCta", {
              amount: formatMoney(session.priceMinor, session.currency, locale),
            })}
      </Button>

      <p className="mt-3 text-center text-[13px] tabular-nums text-text-secondary">
        ⏳{" "}
        {t("countdown", {
          time: `${minutes}:${String(seconds).padStart(2, "0")}`,
        })}
      </p>

      {process.env.NODE_ENV === "development" ? (
        <label className="mt-4 flex items-center justify-center gap-2 text-[12px] text-text-tertiary">
          <input
            type="checkbox"
            checked={simulateDecline}
            onChange={(event) => setSimulateDecline(event.target.checked)}
          />
          {t("devDeclineToggle")}
        </label>
      ) : null}
    </div>
  );
}
