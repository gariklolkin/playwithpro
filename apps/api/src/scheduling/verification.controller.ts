import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  ProProfileResponse,
  Role,
  VerificationSlotResponse,
} from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BookSlotDto } from './dto/book-slot.dto';
import { SchedulingService } from './scheduling.service';

@ApiTags('verification')
@Controller('verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Professional)
export class VerificationController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('slots')
  @ApiOkResponse({
    description: 'Open verification slots (UTC), soonest first.',
  })
  async listSlots(): Promise<VerificationSlotResponse[]> {
    return this.scheduling.listOpenSlots();
  }

  @Post('bookings')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Slot booked; confirmation email sent.' })
  async book(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BookSlotDto,
  ): Promise<ProProfileResponse> {
    return this.scheduling.book(user.id, dto.slotId);
  }

  @Post('bookings/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Meeting moved to the new slot; previous slot reopened.',
  })
  async reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BookSlotDto,
  ): Promise<ProProfileResponse> {
    return this.scheduling.reschedule(user.id, dto.slotId);
  }

  @Post('bookings/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Meeting cancelled; the request awaits a new slot.',
  })
  async cancelBooking(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProProfileResponse> {
    return this.scheduling.cancelByPro(user.id);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Verification request withdrawn entirely.' })
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProProfileResponse> {
    return this.scheduling.withdraw(user.id);
  }
}
