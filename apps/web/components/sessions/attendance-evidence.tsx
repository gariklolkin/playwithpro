"use client";

import {
  AttendanceOutcome,
  type AttendanceSummary,
  type SessionResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { formerMember } from "@/lib/former-member";

/** The coach connecting later than this is worth telling the player. */
const LATE_MINUTES = 10;

export type EvidenceKey =
  | "coachNever"
  | "coachLate"
  | "shortOverlap"
  | "playerNever"
  | "nobody"
  | "youNever"
  | "youLate"
  | "gap";

/**
 * The one sentence the attendance evidence supports, from the viewer's side.
 * Null when there is nothing remarkable (both came on time) or nothing known
 * yet — an unclassified session only reports what did happen (a late coach),
 * never an absence the evidence may still disprove.
 */
export function evidenceKey(
  attendance: AttendanceSummary | null,
  isCoach: boolean,
): EvidenceKey | null {
  if (!attendance) return null;
  switch (attendance.outcome) {
    case AttendanceOutcome.CoachNoShow:
      return isCoach ? "youNever" : "coachNever";
    case AttendanceOutcome.PlayerNoShow:
      return isCoach ? "playerNever" : null;
    case AttendanceOutcome.NoAttendance:
      return "nobody";
    case AttendanceOutcome.EvidenceGap:
      return "gap";
    default:
      if (attendance.coachLateMinutes > LATE_MINUTES) {
        return isCoach ? "youLate" : "coachLate";
      }
      return attendance.partial && attendance.outcome !== null
        ? "shortOverlap"
        : null;
  }
}

export function EvidenceLine({
  session,
  isCoach,
  className,
}: {
  session: Pick<SessionResponse, "attendance" | "coach" | "player">;
  isCoach: boolean;
  className?: string;
}) {
  const t = useTranslations("sessions.actions.evidence");
  const tAccount = useTranslations("account");
  const key = evidenceKey(session.attendance, isCoach);
  if (key === null || session.attendance === null) return null;
  return (
    <p className={className} data-testid="attendance-evidence">
      {t(key, {
        coach: formerMember(
          session.coach.displayName,
          tAccount("formerMember"),
        ),
        player: formerMember(
          session.player.displayName,
          tAccount("formerMember"),
        ),
        minutes:
          key === "shortOverlap"
            ? session.attendance.overlapMinutes
            : session.attendance.coachLateMinutes,
      })}
    </p>
  );
}
