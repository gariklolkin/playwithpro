import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminVerificationItem, Role } from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { RejectVerificationDto } from './dto/reject-verification.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('verification-requests')
  @ApiOkResponse({
    description: 'Pending verification requests, oldest first.',
  })
  async listPending(): Promise<AdminVerificationItem[]> {
    return this.admin.listPending();
  }

  @Post('verification-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Profile verified; coach notified.' })
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.admin.approve(id, user.id);
    return { ok: true };
  }

  @Post('verification-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Request rejected with a note; coach notified.',
  })
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectVerificationDto,
  ): Promise<{ ok: true }> {
    await this.admin.reject(id, user.id, dto.note);
    return { ok: true };
  }
}
