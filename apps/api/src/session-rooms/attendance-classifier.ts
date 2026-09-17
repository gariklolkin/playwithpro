import { AttendanceOutcome } from '@prisma/client';

const MINUTE = 60_000;

/** The coach connecting later than this after the start flags the session as partial. */
export const LATE_COACH_THRESHOLD_MIN = 10;
/** An overlap below this share of the scheduled duration flags the session as partial. */
export const MIN_OVERLAP_SHARE = 0.5;

export interface AttendanceRow {
  userId: string;
  joinedAt: Date;
  connectedAt: Date | null;
  leftAt: Date | null;
}

export interface ClassifierInput {
  startsAt: Date;
  endsAt: Date;
  windowBeforeMin: number;
  windowAfterMin: number;
  playerId: string;
  coachId: string;
  rows: AttendanceRow[];
}

export interface AttendanceFacts {
  playerFirstConnectedAt: Date | null;
  coachFirstConnectedAt: Date | null;
  overlapMinutes: number;
  coachLateMinutes: number;
  partial: boolean;
  /** What the evidence supports once the join window has closed. */
  outcome: AttendanceOutcome;
}

type Interval = [number, number];

/**
 * Pure reading of the attendance evidence — the single definition of
 * "connected" for the classification sweep, the party-facing summary and the
 * admin queue. A party is connected when a provider-reported connection time
 * lies inside the join window; a join row alone proves only that they tried.
 *
 * A coach with no trace at all is a no-show; a coach who pressed join but was
 * never reported connected is an evidence gap, as is any case where nobody
 * connected although somebody tried — so a webhook or media-server outage
 * can never look like a no-show.
 */
export function classifyAttendance(input: ClassifierInput): AttendanceFacts {
  const windowStart = input.startsAt.getTime() - input.windowBeforeMin * MINUTE;
  const windowEnd = input.endsAt.getTime() + input.windowAfterMin * MINUTE;

  const intervalsOf = (userId: string): Interval[] =>
    merge(
      input.rows
        .filter((row) => row.userId === userId && row.connectedAt !== null)
        .map((row): Interval => {
          const from = row.connectedAt!.getTime();
          // An open interval (no leave report) runs to the window's end.
          const to = Math.min(row.leftAt?.getTime() ?? windowEnd, windowEnd);
          return [from, to];
        })
        .filter(([from]) => from >= windowStart && from <= windowEnd)
        .map(([from, to]): Interval => [from, Math.max(from, to)]),
    );

  const player = intervalsOf(input.playerId);
  const coach = intervalsOf(input.coachId);
  const playerConnected = player.length > 0;
  const coachConnected = coach.length > 0;
  const coachHasRows = input.rows.some((row) => row.userId === input.coachId);
  const anyRows = input.rows.length > 0;

  let outcome: AttendanceOutcome;
  if (playerConnected && coachConnected) {
    outcome = AttendanceOutcome.HELD;
  } else if (coachConnected) {
    outcome = AttendanceOutcome.PLAYER_NO_SHOW;
  } else if (playerConnected && !coachHasRows) {
    outcome = AttendanceOutcome.COACH_NO_SHOW;
  } else if (!anyRows) {
    outcome = AttendanceOutcome.NO_ATTENDANCE;
  } else {
    outcome = AttendanceOutcome.EVIDENCE_GAP;
  }

  const overlapMinutes = Math.floor(overlap(player, coach) / MINUTE);
  const coachFirst = coachConnected ? coach[0][0] : null;
  const coachLateMinutes =
    coachFirst === null
      ? 0
      : Math.max(
          0,
          Math.floor((coachFirst - input.startsAt.getTime()) / MINUTE),
        );
  const scheduledMinutes =
    (input.endsAt.getTime() - input.startsAt.getTime()) / MINUTE;
  const partial =
    outcome === AttendanceOutcome.HELD &&
    (coachLateMinutes > LATE_COACH_THRESHOLD_MIN ||
      overlapMinutes < scheduledMinutes * MIN_OVERLAP_SHARE);

  return {
    playerFirstConnectedAt: playerConnected ? new Date(player[0][0]) : null,
    coachFirstConnectedAt: coachFirst === null ? null : new Date(coachFirst),
    overlapMinutes,
    coachLateMinutes,
    partial,
    outcome,
  };
}

/** Sorted union of possibly overlapping intervals (rejoins, duplicate rows). */
function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) {
      last[1] = Math.max(last[1], to);
    } else {
      merged.push([from, to]);
    }
  }
  return merged;
}

/** Total length of the intersection of two sorted, merged interval lists. */
function overlap(a: Interval[], b: Interval[]): number {
  let total = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const from = Math.max(a[i][0], b[j][0]);
    const to = Math.min(a[i][1], b[j][1]);
    if (to > from) total += to - from;
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return total;
}
