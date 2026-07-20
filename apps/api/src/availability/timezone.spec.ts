import { addDays, calendarDateIn, wallClockToUtc } from './timezone';

describe('wallClockToUtc', () => {
  it('converts winter (CET, UTC+1) wall time', () => {
    const instant = wallClockToUtc('Europe/Berlin', 2026, 1, 12, 18 * 60);
    expect(instant.toISOString()).toBe('2026-01-12T17:00:00.000Z');
  });

  it('converts summer (CEST, UTC+2) wall time', () => {
    const instant = wallClockToUtc('Europe/Berlin', 2026, 7, 13, 18 * 60);
    expect(instant.toISOString()).toBe('2026-07-13T16:00:00.000Z');
  });

  it('keeps local time stable across the spring-forward week', () => {
    // DST starts 2026-03-29 in Berlin: Mon before is CET, Mon after is CEST.
    const before = wallClockToUtc('Europe/Berlin', 2026, 3, 23, 18 * 60);
    const after = wallClockToUtc('Europe/Berlin', 2026, 3, 30, 18 * 60);
    expect(before.toISOString()).toBe('2026-03-23T17:00:00.000Z');
    expect(after.toISOString()).toBe('2026-03-30T16:00:00.000Z');
  });

  it('shifts a nonexistent spring-forward time onto the gap edge', () => {
    // 02:30 does not exist on 2026-03-29 in Berlin (02:00 jumps to 03:00).
    const instant = wallClockToUtc('Europe/Berlin', 2026, 3, 29, 150);
    expect(instant.toISOString()).toBe('2026-03-29T01:30:00.000Z'); // 03:30 CEST
  });

  it('resolves an ambiguous fall-back time deterministically', () => {
    // 02:30 occurs twice on 2026-10-25 in Berlin; the CET occurrence wins.
    const instant = wallClockToUtc('Europe/Berlin', 2026, 10, 25, 150);
    expect(instant.toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });

  it('handles zones ahead of UTC across the date line', () => {
    const instant = wallClockToUtc('Australia/Sydney', 2026, 7, 20, 9 * 60);
    expect(instant.toISOString()).toBe('2026-07-19T23:00:00.000Z');
  });
});

describe('calendarDateIn', () => {
  it('returns the local calendar date with ISO weekday', () => {
    // 2026-07-18 20:00Z is already Sunday 2026-07-19 in Sydney.
    const date = calendarDateIn(
      'Australia/Sydney',
      new Date('2026-07-18T20:00:00Z'),
    );
    expect(date).toEqual({ year: 2026, month: 7, day: 19, weekday: 6 });
  });
});

describe('addDays', () => {
  it('rolls over month boundaries and recomputes the weekday', () => {
    const start = calendarDateIn('UTC', new Date('2026-07-30T12:00:00Z'));
    const shifted = addDays(start, 3);
    expect(shifted).toEqual({ year: 2026, month: 8, day: 2, weekday: 6 });
  });
});
