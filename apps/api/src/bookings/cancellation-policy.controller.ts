import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { CancellationPolicy } from '@playwithpro/shared';
import { BookingsService } from './bookings.service';

/**
 * The platform's current cancellation policy, public so the booking surface
 * can show the terms before a session (which snapshots them) exists.
 */
@ApiTags('bookings')
@Controller('cancellation-policy')
export class CancellationPolicyController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOkResponse({ description: 'Current cancellation policy values.' })
  get(): CancellationPolicy {
    const policy = this.bookings.currentPolicy();
    return {
      freeHours: policy.freeHours,
      lateRefundPercent: policy.lateRefundPercent,
      noRefundHours: policy.noRefundHours,
      graceMinutes: policy.graceMin,
    };
  }
}
