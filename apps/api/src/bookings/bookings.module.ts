import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { PaymentsModule } from '../payments/payments.module';
import { StorageModule } from '../storage/storage.module';
import { VideosModule } from '../videos/videos.module';
import { BookingExpiryService } from './booking-expiry.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { SessionProgressionService } from './session-progression.service';
import { SessionVideosService } from './session-videos.service';
import { SettlementService } from './settlement.service';

@Module({
  imports: [
    AuthModule,
    PaymentsModule,
    StorageModule,
    CalendarModule,
    VideosModule,
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingExpiryService,
    SessionProgressionService,
    SessionVideosService,
    SettlementService,
  ],
  exports: [BookingsService, SessionProgressionService, SettlementService],
})
export class BookingsModule {}
