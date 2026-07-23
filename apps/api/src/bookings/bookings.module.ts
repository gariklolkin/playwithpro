import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { PaymentsModule } from '../payments/payments.module';
import { StorageModule } from '../storage/storage.module';
import { BookingExpiryService } from './booking-expiry.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { SessionProgressionService } from './session-progression.service';

@Module({
  imports: [AuthModule, PaymentsModule, StorageModule, CalendarModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingExpiryService, SessionProgressionService],
  exports: [BookingsService, SessionProgressionService],
})
export class BookingsModule {}
