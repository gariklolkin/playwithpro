import {
  cancellationMoments,
  cancellationTerms,
  type CancellationActor,
} from './cancellation-policy';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const policy = {
  freeHours: 24,
  lateRefundPercent: 50,
  noRefundHours: 2,
  graceMin: 30,
};
const startsAt = new Date('2026-09-25T18:00:00Z');
const before = (ms: number) => new Date(startsAt.getTime() - ms);

function terms(
  now: Date,
  options: { by?: CancellationActor; paidAt?: Date | null } = {},
) {
  return cancellationTerms({
    policy,
    priceMinor: 4005,
    feeMinor: 401,
    startsAt,
    // Paid long ago unless the test is about the grace.
    paidAt: options.paidAt === undefined ? before(72 * HOUR) : options.paidAt,
    by: options.by ?? 'player',
    now,
  });
}

describe('cancellationTerms', () => {
  it('refunds the player in full up to and including the free boundary', () => {
    for (const now of [before(25 * HOUR), before(24 * HOUR)]) {
      expect(terms(now)).toMatchObject({
        tier: 'FREE',
        refundMinor: 4005,
        coachNetMinor: 0,
        coachFeeMinor: 0,
        late: false,
      });
    }
  });

  it('halves the refund inside the window, with a proportional fee', () => {
    // One millisecond past the boundary is already the partial tier.
    for (const now of [before(24 * HOUR - 1), before(10 * HOUR), before(2 * HOUR)]) {
      expect(terms(now)).toEqual({
        tier: 'PARTIAL',
        refundMinor: 2003,
        coachGrossMinor: 2002,
        coachFeeMinor: 200,
        coachNetMinor: 1802,
        late: false,
      });
    }
  });

  it('refunds nothing inside the no-refund window', () => {
    expect(terms(before(2 * HOUR - 1))).toEqual({
      tier: 'NONE',
      refundMinor: 0,
      coachGrossMinor: 4005,
      coachFeeMinor: 401,
      coachNetMinor: 3604,
      late: false,
    });
  });

  it('gives a late booking its grace, and only that', () => {
    const paidAt = before(5 * HOUR);
    const at = (minutesAfterPayment: number) =>
      new Date(paidAt.getTime() + minutesAfterPayment * MINUTE);

    expect(terms(at(20), { paidAt }).tier).toBe('FREE');
    expect(terms(at(30), { paidAt }).tier).toBe('FREE');
    expect(terms(at(31), { paidAt }).tier).toBe('PARTIAL');
  });

  it('never stretches the grace into the no-refund window', () => {
    // Paid 2 h 10 min before start: only 10 minutes of grace remain.
    const paidAt = before(2 * HOUR + 10 * MINUTE);
    expect(terms(new Date(paidAt.getTime() + 5 * MINUTE), { paidAt }).tier).toBe(
      'FREE',
    );
    expect(
      terms(new Date(paidAt.getTime() + 11 * MINUTE), { paidAt }).tier,
    ).toBe('NONE');
  });

  it('grants no grace to a booking paid while cancellation was still free', () => {
    const paidAt = before(30 * HOUR);
    expect(terms(before(23 * HOUR), { paidAt }).tier).toBe('PARTIAL');
  });

  it('treats an unpaid booking as paid now (the checkout preview)', () => {
    expect(terms(before(5 * HOUR), { paidAt: null }).tier).toBe('FREE');
  });

  it('always refunds in full when the coach cancels, recording lateness', () => {
    expect(terms(before(25 * HOUR), { by: 'coach' })).toMatchObject({
      tier: 'FREE',
      refundMinor: 4005,
      late: false,
    });
    expect(terms(before(3 * HOUR), { by: 'coach' })).toMatchObject({
      tier: 'FREE',
      refundMinor: 4005,
      late: true,
    });
  });

  it('never counts an admin cancellation as late', () => {
    expect(terms(before(HOUR), { by: 'admin' })).toMatchObject({
      tier: 'FREE',
      refundMinor: 4005,
      late: false,
    });
  });

  it('rounds odd percentages to a minor unit and keeps the sum exact', () => {
    const result = cancellationTerms({
      policy: { ...policy, lateRefundPercent: 33 },
      priceMinor: 999,
      feeMinor: 100,
      startsAt,
      paidAt: before(72 * HOUR),
      by: 'player',
      now: before(10 * HOUR),
    });
    expect(result.refundMinor).toBe(330);
    expect(result.refundMinor + result.coachGrossMinor).toBe(999);
    expect(result.coachFeeMinor).toBe(67);
  });
});

describe('cancellationMoments', () => {
  it('names the two boundaries and no grace for an early booking', () => {
    expect(cancellationMoments(policy, startsAt, before(72 * HOUR))).toEqual({
      freeUntil: before(24 * HOUR),
      partialUntil: before(2 * HOUR),
      graceUntil: null,
    });
  });

  it('names the grace end for a late booking', () => {
    const paidAt = before(5 * HOUR);
    expect(cancellationMoments(policy, startsAt, paidAt).graceUntil).toEqual(
      new Date(paidAt.getTime() + 30 * MINUTE),
    );
  });

  it('has no grace once the no-refund window began', () => {
    expect(
      cancellationMoments(policy, startsAt, before(HOUR)).graceUntil,
    ).toBeNull();
  });
});
