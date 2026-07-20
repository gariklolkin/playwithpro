/**
 * Minimal IANA-timezone wall-clock math built on Intl — enough for slot
 * materialization without pulling in a date library.
 */

export interface CalendarDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0 = Monday … 6 = Sunday (ISO). */
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = formatterCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, dtf);
  }
  return dtf;
}

function wallClockParts(timeZone: string, instant: Date) {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter(timeZone).formatToParts(instant)) {
    if (type !== 'literal') {
      parts[type] = Number(value);
    }
  }
  return parts as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

/** Zone offset in ms at the instant (local wall time minus UTC). */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const wc = wallClockParts(timeZone, instant);
  const asUtc = Date.UTC(
    wc.year,
    wc.month - 1,
    wc.day,
    wc.hour,
    wc.minute,
    wc.second,
  );
  // The formatter has second precision; compare against a ms-stripped instant.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Converts a wall-clock time in the zone to the UTC instant, DST-correct.
 * Nonexistent times (spring-forward gap) shift forward by the offset change
 * (e.g. 02:30 becomes 03:30 local); ambiguous times (fall-back overlap)
 * resolve deterministically to one of the two instants.
 */
export function wallClockToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  // Classic two-pass offset guess: the second pass corrects near DST edges.
  let guess = naive - zoneOffsetMs(timeZone, new Date(naive));
  guess = naive - zoneOffsetMs(timeZone, new Date(guess));
  return new Date(guess);
}

/** The calendar date (with ISO weekday) that the instant falls on in the zone. */
export function calendarDateIn(timeZone: string, instant: Date): CalendarDate {
  const wc = wallClockParts(timeZone, instant);
  return withWeekday(wc.year, wc.month, wc.day);
}

/** Shifts a calendar date by whole days (pure calendar arithmetic, no zone). */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days),
  );
  return withWeekday(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

function withWeekday(year: number, month: number, day: number): CalendarDate {
  const weekday =
    (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return { year, month, day, weekday };
}
