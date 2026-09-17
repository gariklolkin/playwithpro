import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CalendarModule } from '../calendar/calendar.module';
import { MailerModule } from '../mailer/mailer.module';
import { EmailDailyBudget } from './email-daily-budget';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationScanService } from './notification-scan.service';
import { NotificationsController } from './notifications.controller';

/**
 * The read side of the outbox (scan + dispatch) and the preference
 * endpoints. The enqueue side lives in the global NotificationsCoreModule.
 */
@Module({
  imports: [AuthModule, BookingsModule, CalendarModule, MailerModule],
  controllers: [NotificationsController],
  providers: [
    EmailDailyBudget,
    NotificationScanService,
    NotificationDispatchService,
  ],
  exports: [
    NotificationDispatchService,
    NotificationScanService,
    EmailDailyBudget,
  ],
})
export class NotificationsModule {}
