import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { MailerModule } from '../mailer/mailer.module';
import { AdminSchedulingController } from './admin-scheduling.controller';
import { FakeMeetingProvider } from './meeting/fake-meeting.provider';
import { MEETING_PROVIDER } from './meeting/meeting-provider';
import { GoogleMeetingProvider } from './meeting/google-meeting.provider';
import { MeetingSyncService } from './meeting/meeting-sync.service';
import { RemindersService } from './reminders.service';
import { SchedulingNotificationsService } from './scheduling-notifications.service';
import { SchedulingService } from './scheduling.service';
import { VerificationController } from './verification.controller';

@Module({
  imports: [AuthModule, MailerModule],
  controllers: [VerificationController, AdminSchedulingController],
  providers: [
    SchedulingService,
    SchedulingNotificationsService,
    MeetingSyncService,
    RemindersService,
    {
      provide: MEETING_PROVIDER,
      // Real Google Calendar only when a service-account key is configured;
      // dev/test environments fall back to the deterministic fake.
      useFactory: (config: ConfigService) =>
        config.get<string>('GOOGLE_SA_KEY')
          ? new GoogleMeetingProvider(config)
          : new FakeMeetingProvider(),
      inject: [ConfigService],
    },
  ],
  exports: [SchedulingService, MeetingSyncService],
})
export class SchedulingModule {}
