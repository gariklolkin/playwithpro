import { Injectable, Logger } from '@nestjs/common';
import { MOCK_DECLINE_INSTRUMENT } from '@playwithpro/shared';
import { HoldInput, HoldResult, PaymentProvider } from './payment-provider';

/**
 * MVP stand-in: holds succeed instantly with a minted reference, no money
 * moves anywhere. The decline sentinel keeps the failure path testable
 * end to end (dev-visible toggle on the checkout page, e2e tests).
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);

  hold(input: HoldInput): Promise<HoldResult> {
    if (input.instrument === MOCK_DECLINE_INSTRUMENT) {
      this.logger.log(`Mock hold declined for session ${input.sessionId}`);
      return Promise.resolve({ ok: false, reason: 'card_declined' });
    }
    this.logger.log(
      `Mock hold of ${input.amountMinor} ${input.currency} for session ${input.sessionId}`,
    );
    return Promise.resolve({
      ok: true,
      providerRef: `mock-hold-${input.sessionId}`,
    });
  }

  release(providerRef: string): Promise<void> {
    this.logger.log(`Mock release of ${providerRef}`);
    return Promise.resolve();
  }

  refund(providerRef: string): Promise<void> {
    this.logger.log(`Mock refund of ${providerRef}`);
    return Promise.resolve();
  }
}
