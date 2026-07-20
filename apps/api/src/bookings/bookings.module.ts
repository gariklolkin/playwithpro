import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { StorageModule } from '../storage/storage.module';
import { BookingExpiryService } from './booking-expiry.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AuthModule, PaymentsModule, StorageModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingExpiryService],
  exports: [BookingsService],
})
export class BookingsModule {}
