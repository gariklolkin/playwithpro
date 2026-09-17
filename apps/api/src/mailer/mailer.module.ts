import { Module } from '@nestjs/common';
import { EmailRenderer } from './email-renderer';
import { MailerService } from './mailer.service';

@Module({
  providers: [EmailRenderer, MailerService],
  exports: [EmailRenderer, MailerService],
})
export class MailerModule {}
