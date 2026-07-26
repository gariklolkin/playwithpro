import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminUserDetail,
  AdminUserListResponse,
  Role,
} from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';

@ApiTags('admin')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOkResponse({
    description: 'User directory, newest first, searchable and paginated.',
  })
  async list(
    @Query() query: AdminUsersQueryDto,
  ): Promise<AdminUserListResponse> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Account basics, profile summaries, and activity counters.',
  })
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserDetail> {
    return this.users.detail(id);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Account suspended; refresh tokens revoked.',
  })
  async suspend(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    return this.users.suspend(id, admin.id);
  }

  @Post(':id/unsuspend')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Suspension lifted.' })
  async unsuspend(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    return this.users.unsuspend(id, admin.id);
  }
}
