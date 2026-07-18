import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ProProfileResponse, Role, ServiceType } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { UpdateProProfileDto } from './dto/update-pro-profile.dto';
import { UpsertProServiceDto } from './dto/upsert-pro-service.dto';
import { ProsService } from './pros.service';

@ApiTags('pros')
@Controller('pros')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Professional)
export class ProsController {
  constructor(private readonly pros: ProsService) {}

  @Get('me/profile')
  @ApiOkResponse({ description: 'Coach profile (created lazily as a draft).' })
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProProfileResponse> {
    return this.pros.getProfile(user.id);
  }

  @Patch('me/profile')
  @ApiOkResponse({ description: 'Profile fields updated.' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProProfileDto,
  ): Promise<ProProfileResponse> {
    return this.pros.updateProfile(user.id, dto);
  }

  @Put('me/services/:type')
  @ApiOkResponse({ description: 'Service upserted.' })
  async upsertService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type', new ParseEnumPipe(ServiceType)) type: ServiceType,
    @Body() dto: UpsertProServiceDto,
  ): Promise<ProProfileResponse> {
    return this.pros.upsertService(user.id, type, dto);
  }

  @Delete('me/services/:type')
  @ApiOkResponse({ description: 'Service removed.' })
  async deleteService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type', new ParseEnumPipe(ServiceType)) type: ServiceType,
  ): Promise<ProProfileResponse> {
    return this.pros.deleteService(user.id, type);
  }

  @Post('me/verification')
  @ApiOkResponse({ description: 'Verification submitted; profile pending.' })
  async submitVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitVerificationDto,
  ): Promise<ProProfileResponse> {
    return this.pros.submitVerification(user.id, dto);
  }
}
