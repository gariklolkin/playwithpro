import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { MailerModule } from '../mailer/mailer.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { StorageModule } from '../storage/storage.module';
import { VideosModule } from '../videos/videos.module';
import { AccountDataController } from './account-data.controller';
import { AccountDeletionService } from './account-deletion.service';
import { AccountExportService } from './account-export.service';
import { AccountRequestsService } from './account-requests.service';
import { AdminAccountDataController } from './admin-account-data.controller';
import { ACCOUNT_ERASURE_HOOKS, AccountErasureHook } from './erasure-hook';
import {
  AvailabilityErasureHook,
  AvatarsErasureHook,
  CredentialsErasureHook,
  ObservabilityErasureHook,
  PlayerProfileErasureHook,
  ProProfileErasureHook,
  VerificationErasureHook,
  VideosErasureHook,
} from './hooks/core-hooks';

/** Execution order; the tombstone is written by the service after all of them. */
const CORE_HOOKS = [
  CredentialsErasureHook,
  PlayerProfileErasureHook,
  ProProfileErasureHook,
  AvailabilityErasureHook,
  VerificationErasureHook,
  VideosErasureHook,
  AvatarsErasureHook,
  ObservabilityErasureHook,
];

/**
 * GDPR data rights: deletion (grace period, erasure hooks, tombstone) and
 * export. Later features register their own hook by adding a provider to
 * ACCOUNT_ERASURE_HOOKS' factory below.
 */
@Module({
  imports: [
    AuthModule,
    BookingsModule,
    MailerModule,
    SchedulingModule,
    StorageModule,
    VideosModule,
  ],
  controllers: [AccountDataController, AdminAccountDataController],
  providers: [
    ...CORE_HOOKS,
    {
      provide: ACCOUNT_ERASURE_HOOKS,
      inject: CORE_HOOKS,
      useFactory: (...hooks: AccountErasureHook[]) => hooks,
    },
    AccountDeletionService,
    AccountExportService,
    AccountRequestsService,
  ],
  exports: [AccountDeletionService],
})
export class AccountDataModule {}
