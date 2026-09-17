import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * The enqueue side only, global so booking, settlement, dispute and review
 * flows can write outbox rows without importing the dispatch machinery
 * (which itself depends on those modules).
 */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsCoreModule {}
