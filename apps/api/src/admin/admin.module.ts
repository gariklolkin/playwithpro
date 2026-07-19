import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailerModule } from '../mailer/mailer.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, MailerModule, SchedulingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
