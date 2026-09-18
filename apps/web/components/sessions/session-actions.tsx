"use client";

import {
  AttendanceOutcome,
  CancellationTier,
  CancelledBy,
  CoachGameAnswer,
  DISPUTE_REASON_MAX_LENGTH,
  DisputeKind,
  DisputeOutcome,
  DisputeReasonCategory,
  DisputeResolvedVia,
  DisputeStatus,
  PaymentStatus,
  ServiceType,
  SessionStatus,
  type SessionResponse,
} from "@playwithpro/shared";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { SupportButton } from "@/components/support/support-button";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import {
  FUNNEL_EVENTS,
  track,
  type FunnelEvent,
} from "@/lib/observability/analytics";
import { useNow } from "@/lib/use-now";
import { EvidenceLine } from "./attendance-evidence";
import { RescheduleBanner } from "./reschedule-banner";
import { RescheduleDialog } from "./reschedule-dialog";
import { SystemDisputePanel } from "./system-dispute-panel";
import { formerMember } from "@/lib/former-member";

const CATEGORIES = [
  DisputeReasonCategory.CoachNoShow,
  DisputeReasonCategory.CoachLateOrLeftEarly,
  DisputeReasonCategory.TechnicalProblem,
  DisputeReasonCategory.Other,
] as const;

/**
 * Post-payment lifecycle controls of one session card: what the attendance
 * evidence says, confirm / report-a-problem while awaiting confirmation (the
 * coach of an in-person game answers instead), a system-opened dispute with
 * its refund deadline and the coach's response, pre-start cancellation of a
 * paid session, and the dispute/payout state once the money has moved.
 */
export function SessionActions({
  session,
  isCoach,
}: {
  session: SessionResponse;
  isCoach: boolean;
}) {
  const t = useTranslations("sessions.actions");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const now = useNow();
  const money = (minor: number) => formatMoney(minor, session.currency, locale);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [proposing, setProposing] = useState(false);
  const tReschedule = useTranslations("sessions.reschedule");
  const tAccount = useTranslations("account");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<DisputeReasonCategory | "">("");

  async function post(path: string, body?: object, event?: FunnelEvent) {
    setBusy(true);
    setFailed(false);
    const response = await apiFetch(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    if (event) {
      track(event, { sessionId: session.id, serviceType: session.serviceType });
    }
    router.refresh();
  }

  const awaiting = session.status === SessionStatus.AwaitingConfirmation;
  const ownConfirmedAt = isCoach
    ? session.coachConfirmedAt
    : session.playerConfirmedAt;
  const cancellable =
    session.status === SessionStatus.PaidEscrow &&
    now !== null &&
    new Date(session.startsAt).getTime() > now;

  const settledChip =
    session.escrow === PaymentStatus.Released ? (
      <span className="rounded bg-[#DBEDDB] px-2 py-0.5 text-xs font-medium text-[#1C7A46]">
        💸 {t("paidOut")}
      </span>
    ) : session.escrow === PaymentStatus.Refunded ? (
      <span className="rounded bg-bg-secondary px-2 py-0.5 text-xs font-medium text-text-secondary">
        ↩️ {t("refunded")}
      </span>
    ) : null;

  if (
    session.dispute &&
    session.dispute.status === DisputeStatus.Open &&
    session.dispute.kind !== DisputeKind.PlayerReported
  ) {
    return (
      <SystemDisputePanel
        session={session}
        dispute={session.dispute}
        isCoach={isCoach}
        now={now}
        busy={busy}
        failed={failed}
        onConfirm={() =>
          void post(
            `/sessions/${session.id}/confirm`,
            undefined,
            FUNNEL_EVENTS.sessionConfirmed,
          )
        }
        onRespond={(statement) =>
          void post(`/sessions/${session.id}/dispute/response`, { statement })
        }
      />
    );
  }

  if (session.dispute && session.dispute.status === DisputeStatus.Open) {
    return (
      <div className="mt-3 rounded-lg border border-[#F1C7C4] bg-[#FBE4E4] p-3 text-[13px] text-[#C4554D]">
        <div className="font-medium">⚖️ {t("disputeOpenTitle")}</div>
        {session.dispute.reasonCategory ? (
          <p className="mt-1 font-medium">
            {t(`category.${session.dispute.reasonCategory}`)}
          </p>
        ) : null}
        {session.dispute.reason ? (
          <p className="mt-1" data-ph-mask>
            {session.dispute.reason}
          </p>
        ) : null}
        <p className="mt-1 text-[#9A6A66]">{t("disputeOpenHint")}</p>
      </div>
    );
  }

  if (session.dispute && session.dispute.status === DisputeStatus.Resolved) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
        <span>
          ⚖️{" "}
          {session.dispute.resolvedVia === DisputeResolvedVia.System
            ? t("resolvedSystemRefund")
            : session.dispute.resolvedVia ===
                DisputeResolvedVia.PlayerConfirmation
              ? t("resolvedByConfirmation")
              : session.dispute.outcome === DisputeOutcome.Refund
                ? t("resolvedRefund")
                : t("resolvedRelease")}
        </span>
        {settledChip}
      </div>
    );
  }

  const cancellation = session.cancellation;
  if (cancellation) {
    const who =
      cancellation.by === CancelledBy.Admin
        ? t("cancelled.byAdmin")
        : (cancellation.by === CancelledBy.Coach) === isCoach
          ? t("cancelled.byYou")
          : cancellation.by === CancelledBy.Coach
            ? t("cancelled.byCoach")
            : t("cancelled.byPlayer");
    const fullRefund =
      cancellation.tier === CancellationTier.Free || cancellation.waived;
    const outcome = fullRefund
      ? t("cancelled.refunded")
      : cancellation.refundMinor > 0
        ? t("cancelled.partlyRefunded", {
            amount: money(cancellation.refundMinor),
          })
        : t("cancelled.paidToCoach");
    const settlesIn =
      !cancellation.settled && cancellation.settlesAt && now !== null
        ? format.relativeTime(new Date(cancellation.settlesAt), new Date(now))
        : null;
    return (
      <div className="mt-3 text-[13px] text-text-secondary">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {who} · {outcome}
          </span>
          {cancellation.late ? (
            <span className="rounded bg-[#FDF7E7] px-2 py-0.5 text-xs font-medium text-[#8A6C1B]">
              {t("cancelled.late")}
            </span>
          ) : null}
          {cancellation.waived ? (
            <span className="rounded bg-[#DBEDDB] px-2 py-0.5 text-xs font-medium text-[#1C7A46]">
              {t("cancelled.waived")}
            </span>
          ) : null}
        </div>
        {settlesIn ? (
          <p className="mt-1">
            {isCoach
              ? t("cancelled.pendingCoach", {
                  amount: money(cancellation.coachNetMinor),
                  relative: settlesIn,
                })
              : cancellation.refundMinor > 0
                ? t("cancelled.pendingPlayer", {
                    amount: money(cancellation.refundMinor),
                    relative: settlesIn,
                  })
                : null}
          </p>
        ) : null}
        {isCoach && !fullRefund && !cancellation.settled ? (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            disabled={busy}
            onClick={() =>
              void post(`/sessions/${session.id}/cancellation/waive`)
            }
          >
            ↩️ {t("cancelled.waiveCta")}
          </Button>
        ) : null}
        {failed ? (
          <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
        ) : null}
      </div>
    );
  }

  if (awaiting) {
    const autoConfirmIn =
      session.autoConfirmAt !== null && now !== null
        ? format.relativeTime(new Date(session.autoConfirmAt), new Date(now))
        : null;
    const gameCoach = isCoach && session.serviceType === ServiceType.Game;
    const reasonRequired = category === DisputeReasonCategory.Other;
    const disputeReady =
      category !== "" && (!reasonRequired || reason.trim().length > 0);
    return (
      <div className="mt-3 rounded-lg border border-[#EAD8A3] bg-[#FDF7E7] p-3">
        {/* What actually happened comes before the question. */}
        <EvidenceLine
          session={session}
          isCoach={isCoach}
          className="mb-1 text-[13px] font-medium text-[#C4554D]"
        />
        <div className="text-[13px] font-medium text-[#8A6C1B]">
          {gameCoach
            ? t("gameTitleCoach")
            : isCoach
              ? t("bannerTitleCoach")
              : t("bannerTitlePlayer")}
        </div>
        {isCoach &&
        autoConfirmIn &&
        session.attendance?.outcome === AttendanceOutcome.PlayerNoShow ? (
          <p className="mt-0.5 text-[13px] text-[#8A6C1B]/80">
            {t("playerNoShowNote", { relative: autoConfirmIn })}
          </p>
        ) : autoConfirmIn ? (
          <p className="mt-0.5 text-[13px] text-[#8A6C1B]/80">
            {t("autoConfirm", { relative: autoConfirmIn })}
          </p>
        ) : gameCoach && !ownConfirmedAt ? (
          <p className="mt-0.5 text-[13px] text-[#8A6C1B]/80">
            {t("gameNoAutoConfirm")}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ownConfirmedAt ? (
            <span className="text-[13px] font-medium text-[#1C7A46]">
              ✓{" "}
              {gameCoach && session.coachGameAnswer
                ? t(`gameAnswered.${session.coachGameAnswer}`)
                : t("youConfirmed")}
            </span>
          ) : gameCoach ? (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void post(
                    `/sessions/${session.id}/confirm`,
                    { gameAnswer: CoachGameAnswer.TookPlace },
                    FUNNEL_EVENTS.sessionConfirmed,
                  )
                }
              >
                ✓ {t("gameTookPlace")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void post(
                    `/sessions/${session.id}/confirm`,
                    { gameAnswer: CoachGameAnswer.PlayerAbsent },
                    FUNNEL_EVENTS.sessionConfirmed,
                  )
                }
              >
                {t("gamePlayerAbsent")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void post(
                  `/sessions/${session.id}/confirm`,
                  undefined,
                  FUNNEL_EVENTS.sessionConfirmed,
                )
              }
            >
              ✓ {t("confirmCta")}
            </Button>
          )}
          {!isCoach && !disputeOpen ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setDisputeOpen(true)}
            >
              {t("reportCta")}
            </Button>
          ) : null}
        </div>
        {disputeOpen ? (
          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!disputeReady) {
                return;
              }
              void post(
                `/sessions/${session.id}/dispute`,
                {
                  category,
                  reason: reason.trim() === "" ? undefined : reason.trim(),
                },
                FUNNEL_EVENTS.disputeSubmitted,
              );
            }}
          >
            <fieldset className="mb-2">
              <legend className="mb-1 text-[13px] font-medium text-text">
                {t("category.label")}
              </legend>
              {CATEGORIES.map((value) => (
                <label
                  key={value}
                  className="mr-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text"
                >
                  <input
                    type="radio"
                    name={`dispute-category-${session.id}`}
                    value={value}
                    checked={category === value}
                    onChange={() => setCategory(value)}
                  />
                  {t(`category.${value}`)}
                </label>
              ))}
            </fieldset>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                reasonRequired ? t("disputePlaceholder") : t("disputeOptional")
              }
              aria-required={reasonRequired}
              rows={3}
              maxLength={DISPUTE_REASON_MAX_LENGTH}
              data-ph-mask
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
            />
            {reasonRequired && reason.trim().length === 0 ? (
              <p className="mt-1 text-[12px] text-[#C4554D]">
                {t("disputeOtherRequired")}
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Button size="sm" type="submit" disabled={busy || !disputeReady}>
                {t("disputeSubmit")}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setDisputeOpen(false)}
              >
                {t("disputeAbort")}
              </Button>
              <SupportButton
                size="sm"
                variant="ghost"
                context={{ kind: "dispute", sessionId: session.id }}
              />
              <Link
                href="/legal/booking-policy"
                target="_blank"
                className="self-center text-[12px] text-text-tertiary hover:text-text"
              >
                {t("disputeRules")}
              </Link>
            </div>
          </form>
        ) : null}
        {failed ? (
          <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
        ) : null}
      </div>
    );
  }

  /** What cancelling now means in money — the API's numbers, never ours. */
  function cancelTermsText(): string {
    const terms = session.cancellationTerms;
    if (!terms) {
      return t("cancelWarning");
    }
    if (isCoach) {
      return terms.late
        ? t("cancelTerms.coachLate", { amount: money(terms.refundMinor) })
        : t("cancelTerms.coach", { amount: money(terms.refundMinor) });
    }
    switch (terms.tier) {
      case CancellationTier.Free:
        return t("cancelTerms.free", { amount: money(terms.refundMinor) });
      case CancellationTier.Partial:
        return t("cancelTerms.partial", {
          refund: money(terms.refundMinor),
          kept: money(session.priceMinor - terms.refundMinor),
        });
      default:
        return t("cancelTerms.none", { amount: money(session.priceMinor) });
    }
  }

  if (cancellable) {
    const counterpartName = formerMember(
      isCoach ? session.player.displayName : session.coach.displayName,
      tAccount("formerMember"),
    );
    return (
      <div className="mt-3">
        {session.reschedule ? (
          <RescheduleBanner
            sessionId={session.id}
            proposal={session.reschedule}
            counterpartName={counterpartName}
            onChanged={() => router.refresh()}
          />
        ) : null}
        {proposing ? (
          <RescheduleDialog
            session={session}
            onClose={() => setProposing(false)}
            onProposed={() => {
              setProposing(false);
              router.refresh();
            }}
          />
        ) : confirmingCancel ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-text-secondary" data-testid="cancel-terms">
              {cancelTermsText()}
            </span>
            {isCoach && session.rescheduleAllowed ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  setConfirmingCancel(false);
                  setProposing(true);
                }}
              >
                {tReschedule("insteadCta")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void post(
                  `/sessions/${session.id}/cancel`,
                  undefined,
                  FUNNEL_EVENTS.bookingCancelled,
                )
              }
            >
              {t("cancelConfirm")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmingCancel(false)}
            >
              {t("cancelKeep")}
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {session.rescheduleAllowed ? (
              <button
                type="button"
                className="cursor-pointer text-[13px] text-text-secondary underline-offset-2 hover:text-text hover:underline"
                onClick={() => setProposing(true)}
              >
                🗓️ {tReschedule("proposeCta")}
              </button>
            ) : null}
            <button
              type="button"
              className="cursor-pointer text-[13px] text-text-tertiary underline-offset-2 hover:text-[#C4554D] hover:underline"
              onClick={() => setConfirmingCancel(true)}
            >
              {t("cancelCta")}
            </button>
          </div>
        )}
        {failed ? (
          <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
        ) : null}
      </div>
    );
  }

  if (settledChip) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {settledChip}
      </div>
    );
  }

  return null;
}
