import {
  AttendanceOutcome as SharedAttendanceOutcome,
  AttendanceSummary,
  CoachGameAnswer as SharedCoachGameAnswer,
  DisputeKind as SharedDisputeKind,
  DisputeOutcome as SharedDisputeOutcome,
  DisputeReasonCategory as SharedDisputeReasonCategory,
  DisputeResolvedVia as SharedDisputeResolvedVia,
  DisputeStatus as SharedDisputeStatus,
  DisputeSummary,
  DisputeSystemNote,
} from '@playwithpro/shared';
import {
  AttendanceOutcome,
  CoachGameAnswer,
  Dispute,
  DisputeKind,
  DisputeOutcome,
  DisputeReasonCategory,
  DisputeResolvedVia,
  DisputeStatus,
} from '@prisma/client';
import {
  AttendanceRow,
  classifyAttendance,
} from '../session-rooms/attendance-classifier';
import type { RoomWindow } from './session.mapper';

/** Prisma enums are SCREAMING_CASE, the wire format is snake_case. */
const lower = <T extends string>(value: string): T => value.toLowerCase() as T;
const upper = <T extends string>(value: string): T => value.toUpperCase() as T;

export const toSharedDisputeKind = (kind: DisputeKind): SharedDisputeKind =>
  lower(kind);
export const toPrismaDisputeKind = (kind: SharedDisputeKind): DisputeKind =>
  upper(kind);
export const toPrismaReasonCategory = (
  category: SharedDisputeReasonCategory,
): DisputeReasonCategory => upper(category);
export const toPrismaGameAnswer = (
  answer: SharedCoachGameAnswer,
): CoachGameAnswer => upper(answer);
export const toSharedGameAnswer = (
  answer: CoachGameAnswer | null,
): SharedCoachGameAnswer | null =>
  answer === null ? null : lower<SharedCoachGameAnswer>(answer);
export const toSharedAttendanceOutcome = (
  outcome: AttendanceOutcome | null,
): SharedAttendanceOutcome | null =>
  outcome === null ? null : lower<SharedAttendanceOutcome>(outcome);

export function toSharedDisputeOutcome(
  outcome: DisputeOutcome | null,
): SharedDisputeOutcome | null {
  return outcome === null ? null : lower<SharedDisputeOutcome>(outcome);
}

/** The columns the party- and admin-facing dispute shapes are built from. */
export const DISPUTE_SUMMARY_SELECT = {
  status: true,
  kind: true,
  reasonCategory: true,
  reason: true,
  outcome: true,
  responseDueAt: true,
  coachResponse: true,
  coachRespondedAt: true,
  resolvedVia: true,
  systemNoteCode: true,
} as const;

export type DisputeSummaryRow = Pick<
  Dispute,
  keyof typeof DISPUTE_SUMMARY_SELECT
>;

export function toDisputeSummary(dispute: DisputeSummaryRow): DisputeSummary {
  return {
    status:
      dispute.status === DisputeStatus.OPEN
        ? SharedDisputeStatus.Open
        : SharedDisputeStatus.Resolved,
    kind: toSharedDisputeKind(dispute.kind),
    reasonCategory:
      dispute.reasonCategory === null
        ? null
        : lower<SharedDisputeReasonCategory>(dispute.reasonCategory),
    reason: dispute.reason,
    outcome: toSharedDisputeOutcome(dispute.outcome),
    // A deadline only counts while it can still fire.
    responseDueAt:
      dispute.status === DisputeStatus.OPEN
        ? (dispute.responseDueAt?.toISOString() ?? null)
        : null,
    coachResponse: dispute.coachResponse,
    coachRespondedAt: dispute.coachRespondedAt?.toISOString() ?? null,
    resolvedVia:
      dispute.resolvedVia === null
        ? null
        : lower<SharedDisputeResolvedVia>(
            dispute.resolvedVia satisfies DisputeResolvedVia,
          ),
    systemNote:
      dispute.systemNoteCode === null
        ? null
        : lower<DisputeSystemNote>(dispute.systemNoteCode),
  };
}

/**
 * The attendance summary of an online session: times and overlap from the
 * current rows, the outcome only once it was frozen by the classification.
 */
export function toAttendanceSummary(
  session: {
    startsAt: Date;
    endsAt: Date;
    playerId: string;
    attendanceOutcome: AttendanceOutcome | null;
    attendancePartial: boolean;
    classifiedAt: Date | null;
  },
  coachUserId: string,
  rows: AttendanceRow[],
  window: RoomWindow,
): AttendanceSummary {
  const facts = classifyAttendance({
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    windowBeforeMin: window.beforeMin,
    windowAfterMin: window.afterMin,
    playerId: session.playerId,
    coachId: coachUserId,
    rows,
  });
  const classified = session.classifiedAt !== null;
  return {
    playerFirstConnectedAt: facts.playerFirstConnectedAt?.toISOString() ?? null,
    coachFirstConnectedAt: facts.coachFirstConnectedAt?.toISOString() ?? null,
    overlapMinutes: facts.overlapMinutes,
    coachLateMinutes: facts.coachLateMinutes,
    partial: classified ? session.attendancePartial : facts.partial,
    outcome: toSharedAttendanceOutcome(session.attendanceOutcome),
  };
}
