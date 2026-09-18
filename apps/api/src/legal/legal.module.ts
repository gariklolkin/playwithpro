import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LegalController } from './legal.controller';
import { LegalGuard } from './legal.guard';
import { LegalNoticeService } from './legal-notice.service';
import { LegalService } from './legal.service';

/** Global: the guard and the service are used by auth, bookings, pros and admin. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [LegalController],
  providers: [LegalService, LegalGuard, LegalNoticeService],
  exports: [LegalService, LegalGuard],
})
export class LegalModule {}
