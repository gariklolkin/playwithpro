import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminBookingItem, AdminSlotItem, Role } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSlotsDto } from './dto/create-slots.dto';
import { SchedulingService } from './scheduling.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminSchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('verification-slots')
  @ApiOkResponse({
    description: 'Published slots (non-removed), soonest first.',
  })
  async listSlots(): Promise<AdminSlotItem[]> {
    return this.scheduling.listSlots();
  }

  @Post('verification-slots')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Slots published; duplicates skipped.' })
  async createSlots(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSlotsDto,
  ): Promise<AdminSlotItem[]> {
    return this.scheduling.createSlots(user.id, dto.slots);
  }

  @Delete('verification-slots/:id')
  @ApiOkResponse({
    description:
      'Slot removed. A booked slot requires force=true and cancels its meeting.',
  })
  async removeSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('force', new ParseBoolPipe({ optional: true })) force?: boolean,
  ): Promise<AdminSlotItem[]> {
    return this.scheduling.removeSlot(id, force ?? false);
  }

  @Get('verification-bookings')
  @ApiOkResponse({ description: 'Bookings of the last 30 days and upcoming.' })
  async listBookings(): Promise<AdminBookingItem[]> {
    return this.scheduling.listBookings();
  }

  @Post('verification-bookings/:id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Meeting marked as in progress.' })
  async start(@Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.scheduling.startMeeting(id);
    return { ok: true };
  }

  @Post('verification-bookings/:id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Coach marked as no-show; request returns to scheduling (or is cancelled after the second miss).',
  })
  async noShow(@Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.scheduling.markNoShow(id);
    return { ok: true };
  }

  @Post('verification-bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Meeting cancelled by admin; coach notified to rebook.',
  })
  async cancel(@Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.scheduling.cancelBookingByAdmin(id);
    return { ok: true };
  }

  @Post('verification-bookings/:id/retry-sync')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Calendar sync retried for the booking.' })
  async retrySync(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.scheduling.retrySync(id);
    return { ok: true };
  }
}
