import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { StorageModule } from '../storage/storage.module';
import { VideosModule } from '../videos/videos.module';
import { BookingExpiryService } from './booking-expiry.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { DisputeResolutionService } from './dispute-resolution.service';
import { SessionProgressionService } from './session-progression.service';
import { SessionVideosService } from './session-videos.service';
import { SettlementService } from './settlement.service';

@Module({
  imports: [AuthModule, PaymentsModule, StorageModule, VideosModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingExpiryService,
    DisputeResolutionService,
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
