import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider';

@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      // Mock is the only implementation in MVP; a real vendor slots in here
      // behind a config switch when one is chosen.
      useClass: MockPaymentProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
