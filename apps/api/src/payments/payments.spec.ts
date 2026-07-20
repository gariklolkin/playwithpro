import { MOCK_DECLINE_INSTRUMENT } from '@playwithpro/shared';
import { MockPaymentProvider } from './mock-payment.provider';
import { computePlatformFee } from './payment-provider';

describe('computePlatformFee', () => {
  it('takes the configured percentage of the price', () => {
    expect(computePlatformFee(5000, 10)).toBe(500);
  });

  it('rounds half up on fractional minor units', () => {
    // 10% of 4005 = 400.5 → 401
    expect(computePlatformFee(4005, 10)).toBe(401);
    // 10% of 4004 = 400.4 → 400
    expect(computePlatformFee(4004, 10)).toBe(400);
  });

  it('supports a zero fee', () => {
    expect(computePlatformFee(5000, 0)).toBe(0);
  });
});

describe('MockPaymentProvider', () => {
  const provider = new MockPaymentProvider();

  it('holds instantly with a session-scoped reference', async () => {
    const result = await provider.hold({
      sessionId: 'session-1',
      amountMinor: 5000,
      currency: 'EUR',
    });
    expect(result).toEqual({ ok: true, providerRef: 'mock-hold-session-1' });
  });

  it('declines the sentinel instrument', async () => {
    const result = await provider.hold({
      sessionId: 'session-1',
      amountMinor: 5000,
      currency: 'EUR',
      instrument: MOCK_DECLINE_INSTRUMENT,
    });
    expect(result).toEqual({ ok: false, reason: 'card_declined' });
  });
});
