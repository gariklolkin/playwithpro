import { AttendanceOutcome } from '@prisma/client';
import { AttendanceRow, classifyAttendance } from './attendance-classifier';

const START = new Date('2026-09-20T10:00:00Z');
const END = new Date('2026-09-20T11:00:00Z');
const at = (minutesFromStart: number) =>
  new Date(START.getTime() + minutesFromStart * 60_000);

function row(
  userId: string,
  joined: number,
  connected: number | null,
  left: number | null = null,
): AttendanceRow {
  return {
    userId,
    joinedAt: at(joined),
    connectedAt: connected === null ? null : at(connected),
    leftAt: left === null ? null : at(left),
  };
}

function classify(rows: AttendanceRow[]) {
  return classifyAttendance({
    startsAt: START,
    endsAt: END,
    windowBeforeMin: 15,
    windowAfterMin: 30,
    playerId: 'player',
    coachId: 'coach',
    rows,
  });
}

describe('classifyAttendance', () => {
  it('held: both connected, on time, full overlap', () => {
    const facts = classify([row('player', -2, -1, 60), row('coach', 0, 1, 60)]);
    expect(facts.outcome).toBe(AttendanceOutcome.HELD);
    expect(facts.partial).toBe(false);
    expect(facts.overlapMinutes).toBe(59);
    expect(facts.coachLateMinutes).toBe(1);
    expect(facts.playerFirstConnectedAt).toEqual(at(-1));
    expect(facts.coachFirstConnectedAt).toEqual(at(1));
  });

  it('player no-show: only the coach connected', () => {
    const facts = classify([row('coach', 0, 0, 40)]);
    expect(facts.outcome).toBe(AttendanceOutcome.PLAYER_NO_SHOW);
    expect(facts.partial).toBe(false);
    expect(facts.overlapMinutes).toBe(0);
  });

  it('a player who pressed join but never connected is still a player no-show', () => {
    const facts = classify([row('coach', 0, 0, 40), row('player', 1, null)]);
    expect(facts.outcome).toBe(AttendanceOutcome.PLAYER_NO_SHOW);
  });

  it('coach no-show: the player connected and the coach left no trace', () => {
    const facts = classify([row('player', 0, 0, 25)]);
    expect(facts.outcome).toBe(AttendanceOutcome.COACH_NO_SHOW);
    expect(facts.coachFirstConnectedAt).toBeNull();
    expect(facts.coachLateMinutes).toBe(0);
  });

  it('no attendance: no rows at all', () => {
    expect(classify([]).outcome).toBe(AttendanceOutcome.NO_ATTENDANCE);
  });

  it('evidence gap: the coach pressed join but no connection was reported', () => {
    const facts = classify([row('player', 0, 0, 30), row('coach', 1, null)]);
    expect(facts.outcome).toBe(AttendanceOutcome.EVIDENCE_GAP);
  });

  it('evidence gap: webhook outage — join rows exist but nobody is reported connected', () => {
    expect(classify([row('player', 0, null)]).outcome).toBe(
      AttendanceOutcome.EVIDENCE_GAP,
    );
    expect(
      classify([row('player', 0, null), row('coach', 0, null)]).outcome,
    ).toBe(AttendanceOutcome.EVIDENCE_GAP);
  });

  it('ignores connections outside the join window', () => {
    // The coach "connected" two hours after the end: not evidence of attending.
    const facts = classify([row('player', 0, 0, 30), row('coach', 180, 181)]);
    expect(facts.outcome).toBe(AttendanceOutcome.EVIDENCE_GAP);
    expect(facts.coachFirstConnectedAt).toBeNull();
  });

  it('flags a late coach as partial without changing the outcome', () => {
    const facts = classify([row('player', 0, 0, 60), row('coach', 18, 18, 60)]);
    expect(facts.outcome).toBe(AttendanceOutcome.HELD);
    expect(facts.coachLateMinutes).toBe(18);
    expect(facts.partial).toBe(true);
  });

  it('flags an overlap under half of the scheduled duration as partial', () => {
    const facts = classify([row('player', 0, 0, 60), row('coach', 0, 0, 20)]);
    expect(facts.outcome).toBe(AttendanceOutcome.HELD);
    expect(facts.overlapMinutes).toBe(20);
    expect(facts.partial).toBe(true);
  });

  it('merges rejoins: first connection is the earliest, overlap spans all intervals', () => {
    const facts = classify([
      row('coach', 0, 0, 60),
      row('player', 0, 0, 10),
      row('player', 12, 12, 40),
      // Overlapping duplicate row from a reconnect on the same token.
      row('player', 30, 30, 50),
    ]);
    expect(facts.outcome).toBe(AttendanceOutcome.HELD);
    expect(facts.playerFirstConnectedAt).toEqual(at(0));
    expect(facts.overlapMinutes).toBe(48);
    expect(facts.partial).toBe(false);
  });

  it('treats a missing leave report as connected until the window closes', () => {
    const facts = classify([row('player', 0, 0), row('coach', 0, 0)]);
    // 60 scheduled minutes + the 30-minute after-window.
    expect(facts.overlapMinutes).toBe(90);
    expect(facts.partial).toBe(false);
  });
});
