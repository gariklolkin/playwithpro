import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { StorageModule } from '../storage/storage.module';
import { VideosModule } from '../videos/videos.module';
import { BookingExpiryService } from './booking-expiry.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CancellationPolicyController } from './cancellation-policy.controller';
import { DisputeResolutionService } from './dispute-resolution.service';
import { ReschedulesController } from './reschedules.controller';
import { ReschedulesService } from './reschedules.service';
import { SessionProgressionService } from './session-progression.service';
import { SessionVideosService } from './session-videos.service';
import { SettlementService } from './settlement.service';

@Module({
  imports: [AuthModule, PaymentsModule, StorageModule, VideosModule],
  controllers: [
    BookingsController,
    CancellationPolicyController,
    ReschedulesController,
  ],
  providers: [
    BookingsService,
    BookingExpiryService,
    DisputeResolutionService,
    ReschedulesService,
    SessionProgressionService,
    SessionVideosService,
    SettlementService,
  ],
  exports: [
    BookingsService,
    DisputeResolutionService,
    SessionProgressionService,
    SettlementService,
  ],
})
export class BookingsModule {}
