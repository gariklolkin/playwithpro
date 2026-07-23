import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { CALENDAR_PROVIDER } from './calendar-provider';
import { IcsCalendarProvider } from './ics-calendar.provider';

@Module({
  imports: [MailerModule],
  providers: [{ provide: CALENDAR_PROVIDER, useClass: IcsCalendarProvider }],
  exports: [CALENDAR_PROVIDER],
})
export class CalendarModule {}
