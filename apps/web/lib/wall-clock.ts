/**
 * Converts a wall-clock time in an IANA zone to the UTC instant, DST-correct.
 * Mirrors the API-side materializer math so a manually added slot lands on
 * the same instant the coach saw in the picker.
 */
export function wallClockToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  // Two-pass offset guess: the second pass corrects near DST edges.
  let guess = naive - zoneOffsetMs(timeZone, new Date(naive));
  guess = naive - zoneOffsetMs(timeZone, new Date(guess));
  return new Date(guess);
}

function zoneOffsetMs(timeZone: string, instant: Date): number {
  const parts: Record<string, number> = {};
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  for (const { type, value } of formatted) {
    if (type !== "literal") {
      parts[type] = Number(value);
    }
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}
