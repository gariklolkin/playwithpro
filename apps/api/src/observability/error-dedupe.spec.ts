import { ErrorDeduper, fingerprintOf } from './error-dedupe';

describe('ErrorDeduper', () => {
  const boom = () => new Error('boom');

  it('reports a fingerprint once per window and counts the repeats', () => {
    const deduper = new ErrorDeduper(60_000, 30);
    const error = boom();

    expect(deduper.decide(error, 1_000).report).toBe(true);
    expect(deduper.decide(error, 2_000)).toMatchObject({
      report: false,
      count: 2,
    });
    expect(deduper.decide(error, 61_500)).toMatchObject({
      report: true,
      count: 1,
    });
  });

  it('distinguishes errors by name, message and top frame', () => {
    const deduper = new ErrorDeduper();
    const a = new Error('one');
    const b = new Error('two');
    const c = new TypeError('one');

    expect(deduper.decide(a).report).toBe(true);
    expect(deduper.decide(b).report).toBe(true);
    expect(deduper.decide(c).report).toBe(true);
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(c));
  });

  it('caps reports per minute per process across fingerprints', () => {
    const deduper = new ErrorDeduper(60_000, 3);
    const reported = Array.from({ length: 5 }, (_, i) =>
      deduper.decide(new Error(`distinct ${i}`), 10_000 + i),
    ).filter((decision) => decision.report);

    expect(reported).toHaveLength(3);
    // A new minute resets the budget.
    expect(deduper.decide(new Error('later'), 71_000).report).toBe(true);
  });

  it('fingerprints non-Error throwables by type and value', () => {
    expect(fingerprintOf('oops')).toBe(fingerprintOf('oops'));
    expect(fingerprintOf('oops')).not.toBe(fingerprintOf(42));
  });
});
