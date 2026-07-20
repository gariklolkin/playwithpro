"use client";

import { SessionStatus, type SessionResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { LocalTime } from "@/components/catalog/local-time";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Link } from "@/i18n/navigation";

/** Pastel status tags per DESIGN.md: blue = trust/escrow, yellow = action needed. */
const STATUS_BADGE: Partial<Record<SessionStatus, string>> = {
  [SessionStatus.PendingPayment]: "bg-[#FAECC8] text-[#8A6C1B]",
  [SessionStatus.PaidEscrow]: "bg-[#D6E4F5] text-[#2A5FC7]",
  [SessionStatus.InProgress]: "bg-[#D6E4F5] text-[#2A5FC7]",
  [SessionStatus.AwaitingConfirmation]: "bg-[#FAECC8] text-[#8A6C1B]",
  [SessionStatus.CompletedPaid]: "bg-[#DBEDDB] text-[#1C7A46]",
  [SessionStatus.Disputed]: "bg-[#FBE4E4] text-[#C4554D]",
  [SessionStatus.Resolved]: "bg-[#DBEDDB] text-[#1C7A46]",
  [SessionStatus.Cancelled]: "bg-bg-secondary text-text-tertiary",
};

function SessionCard({
  session,
  isCoach,
}: {
  session: SessionResponse;
  isCoach: boolean;
}) {
  const t = useTranslations("sessions");
  const tCatalog = useTranslations("catalog");
  const other = isCoach ? session.player : session.coach;

  return (
    <li className="rounded-card border border-border bg-bg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar
            displayName={other.displayName}
            avatarUrl={other.avatarUrl}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isCoach ? (
                <span className="font-semibold text-text">
                  {other.displayName}
                </span>
              ) : (
                <Link
                  href={`/coaches/${session.coach.id}`}
                  className="truncate font-semibold text-text hover:underline"
                >
                  {other.displayName}
                </Link>
              )}
              <span className="text-[13px] text-text-secondary">
                {tCatalog(`service.${session.serviceType}`)}
              </span>
            </div>
            <div className="mt-0.5 text-[13px] text-text-secondary">
              <LocalTime iso={session.startsAt} />{" "}
              <span className="text-text-tertiary">{t("yourTime")}</span>
            </div>
            {isCoach && session.videoId ? (
              <div className="mt-0.5 text-[13px]">
                <Link
                  href={`/dashboard/videos/${session.videoId}`}
                  className="text-[#2A5FC7] hover:underline"
                >
                  📹 {session.videoTitle}
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              STATUS_BADGE[session.status] ??
              "bg-bg-secondary text-text-tertiary"
            }`}
          >
            {t(`status.${session.status}`)}
          </span>
          {!isCoach && session.status === SessionStatus.PendingPayment ? (
            <Link
              href={`/booking/${session.id}`}
              className="rounded-md bg-text px-2.5 py-1.5 text-[13px] font-medium text-white no-underline hover:bg-black"
            >
              {t("payCta")}
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function SessionsList({
  upcoming,
  past,
  isCoach,
}: {
  upcoming: SessionResponse[];
  past: SessionResponse[];
  isCoach: boolean;
}) {
  const t = useTranslations("sessions");

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-border p-10 text-center">
        <div className="text-3xl">🗓️</div>
        <div className="mt-2 font-semibold text-text">{t("emptyTitle")}</div>
        <p className="mt-1 text-sm text-text-secondary">
          {isCoach ? t("emptySubtitleCoach") : t("emptySubtitlePlayer")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
          {t("upcoming")}
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("noneUpcoming")}</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isCoach={isCoach}
              />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
            {t("past")}
          </h2>
          <ul className="space-y-3">
            {past.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isCoach={isCoach}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
