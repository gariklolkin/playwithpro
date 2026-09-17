import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BookingsService } from '../bookings/bookings.service';
import { AdminCancelSessionDto } from './dto/admin-cancel-session.dto';

/**
 * The two ways money moves from the admin console, both through the same
 * guarded routines the parties use: a force-majeure cancellation (always a
 * full refund, never a late cancellation) and the late-fee waiver.
 */
@ApiTags('admin')
@Controller('admin/sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminSessionsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Force-majeure cancellation of a paid session before its start: full refund, reason stored.',
  })
  async cancel(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCancelSessionDto,
  ): Promise<{ ok: true }> {
    await this.bookings.cancelByAdmin(admin, id, dto.reason);
    return { ok: true };
  }

  @Post(':id/cancellation/waive')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Waives the late fee of a cancelled session while its payment has not settled: full refund.',
  })
  async waive(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.bookings.waiveCancellationFee(admin, id);
    return { ok: true };
  }
}
