import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CoachAvailabilityResponse, Role } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AvailabilityService } from './availability.service';
import { CreateManualSlotDto } from './dto/create-manual-slot.dto';
import { ReplaceAvailabilityRulesDto } from './dto/replace-availability-rules.dto';

@ApiTags('availability')
@Controller('pros/me/availability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Professional)
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @ApiOkResponse({ description: 'Weekly template plus upcoming slots.' })
  async getMyAvailability(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CoachAvailabilityResponse> {
    return this.availability.getMyAvailability(user.id);
  }

  @Put('rules')
  @ApiOkResponse({ description: 'Template replaced; slots re-materialized.' })
  async replaceRules(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplaceAvailabilityRulesDto,
  ): Promise<CoachAvailabilityResponse> {
    return this.availability.replaceRules(user.id, dto.rules);
  }

  @Post('slots')
  @ApiOkResponse({ description: 'One-off slot added.' })
  async addManualSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManualSlotDto,
  ): Promise<CoachAvailabilityResponse> {
    return this.availability.addManualSlot(user.id, dto.startsAt);
  }

  @Delete('slots/:id')
  @ApiOkResponse({ description: 'Open slot removed.' })
  async removeSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) slotId: string,
  ): Promise<CoachAvailabilityResponse> {
    return this.availability.removeSlot(user.id, slotId);
  }
}
