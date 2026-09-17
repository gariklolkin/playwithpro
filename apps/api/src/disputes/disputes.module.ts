import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { NoShowService } from './no-show.service';

@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [DisputesController],
  providers: [DisputesService, NoShowService],
})
export class DisputesModule {}
