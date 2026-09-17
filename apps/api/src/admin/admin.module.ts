import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { MailerModule } from '../mailer/mailer.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminSessionsController } from './admin-sessions.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, BookingsModule, MailerModule, SchedulingModule],
  controllers: [
    AdminController,
    AdminUsersController,
    AdminFinanceController,
    AdminReviewsController,
    AdminSessionsController,
  ],
  providers: [
    AdminService,
    AdminUsersService,
    AdminFinanceService,
    AdminReviewsService,
  ],
})
export class AdminModule {}
